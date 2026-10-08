import { pipeline, env, Tensor } from '@huggingface/transformers';
import { translationRoot } from './data-paths.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useFSCache = false;
let translator, loadedDirection;
process.on('disconnect', () => process.exit(0));
const progress = (id, phase, completed = 0, total = 0) =>
  process.send?.({ id, type: 'progress', phase, completed, total });

async function splitForModel(text, tokenizer) {
  // Preserve line breaks; split only long sentences to avoid silent truncation.
  const pieces = text.split(/(\r?\n+)/);
  const result = [];
  async function fit(part) {
    const tokens = await tokenizer(part, { truncation: false });
    if (tokens.input_ids.size <= 400) {
      result.push({ text: part });
      return;
    }
    let mid = Math.floor(part.length / 2),
      cut = mid;
    const before = part.lastIndexOf(' ', mid);
    if (before > mid / 2) cut = before;
    if (cut < 1) throw new Error('无法分割输入，请缩短句子。');
    await fit(part.slice(0, cut).trim());
    await fit(part.slice(cut).trim());
  }
  for (const piece of pieces) {
    if (!piece) continue;
    if (/^\r?\n/.test(piece)) {
      result.push({ separator: piece });
      continue;
    }
    if (!piece.trim()) {
      result.push({ separator: piece });
      continue;
    }
    await fit(piece.trim());
  }
  return result;
}
process.on('message', async ({ id, text, direction }) => {
  try {
    if (loadedDirection !== direction) {
      progress(id, 'loading');
      env.localModelPath = translationRoot(direction) + '/';
      if (
        !existsSync(
          join(env.localModelPath, 'opus-mt-' + direction, 'onnx/encoder_model_quantized.onnx'),
        )
      )
        throw new Error(
          '尚未安装离线翻译模型。请在源码目录运行 python3 scripts/models.py install translation。',
        );
      if (translator) {
        await translator.dispose();
        translator = null;
      }
      translator = await pipeline('translation', 'opus-mt-' + direction, {
        local_files_only: true,
        device: 'cpu',
        dtype: 'q8',
        session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
      });
      loadedDirection = direction;
    }
    const parts = await splitForModel(text, translator.tokenizer);
    const total = parts.filter((p) => p.text).length;
    let completed = 0,
      result = '',
      previousWasText = false;
    for (const part of parts) {
      if (part.separator !== undefined) {
        result += part.separator;
        previousWasText = false;
        continue;
      }
      progress(id, 'translating', completed, total);
      const inputs = await translator.tokenizer(part.text, { truncation: false });
      if (direction === 'en-zh') {
        // Marian requires an explicit simplified-Chinese language ID. Insert its
        // vocabulary ID directly; encoding the marker as text is unreliable.
        const languageID = translator.tokenizer.get_vocab().get('>>cmn_Hans<<');
        if (languageID === undefined) throw new Error('翻译词表缺少简体中文语言标记。');
        const ids = BigInt64Array.from([BigInt(languageID), ...inputs.input_ids.data]);
        inputs.input_ids = new Tensor('int64', ids, [1, ids.length]);
        inputs.attention_mask = new Tensor('int64', new BigInt64Array(ids.length).fill(1n), [
          1,
          ids.length,
        ]);
      }
      const output = await translator.model.generate({
        ...inputs,
        max_new_tokens: 512,
        num_beams: 4,
        do_sample: false,
      });
      const value = translator.tokenizer.batch_decode(output, { skip_special_tokens: true })[0];
      if (typeof value !== 'string' || !value.trim())
        throw new Error('未获得译文，请尝试缩短输入。');
      if (previousWasText && direction === 'zh-en') result += ' ';
      result += value.trim();
      previousWasText = true;
      completed++;
    }
    process.send?.({
      id,
      type: 'result',
      text: result,
      segments: completed,
      engine: 'OPUS-MT / Marian · ONNX CPU',
    });
  } catch (error) {
    process.send?.({ id, type: 'error', error: error.message });
  }
});
