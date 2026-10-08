import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { ensureModel, chat, shutdown } from '../engine.mjs';
const image = (await readFile(new URL('./fixtures/english.png', import.meta.url))).toString(
  'base64',
);
const results = [];
try {
  for (const model of ['minicpm-v:4.5', 'qwen3.5:9b']) {
    const start = Date.now();
    await ensureModel(model);
    console.log(model, 'loaded in', (Date.now() - start) / 1000);
    let text = '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    try {
      for await (const event of chat(
        model,
        [
          {
            role: 'user',
            content:
              'Read the English text in this image, then translate it into Chinese. Keep the name Local Lens unchanged. Answer briefly.',
            images: [image],
          },
        ],
        controller.signal,
      ))
        text += event.message?.content || '';
    } finally {
      clearTimeout(timer);
    }
    console.log(model, text);
    assert.match(text, /Local Lens/i);
    assert.match(text, /早/);
    results.push({ model, seconds: (Date.now() - start) / 1000, text });
  }
  await ensureModel('qwen3-vl:4b');
  console.log('Switch back passed');
  await writeFile(
    new URL('./new-vision-results.json', import.meta.url),
    JSON.stringify(results, null, 2),
  );
} finally {
  await shutdown();
}
