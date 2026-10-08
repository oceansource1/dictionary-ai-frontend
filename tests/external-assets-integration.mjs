import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = process.env.LOCAL_LENS_TEST_RESOURCES;
if (!root)
  throw new Error('Set LOCAL_LENS_TEST_RESOURCES to the lightweight app Resources directory');
const engine = await import(pathToFileURL(resolve(root, 'engine.mjs')));
const translation = await import(pathToFileURL(resolve(root, 'translation.mjs')));
try {
  const models = await engine.listModels();
  assert.equal(models.find((m) => m.name === 'qwen3-vl:4b').source, '已安装');
  await engine.ensureModel('qwen3-vl:4b');
  assert.equal(engine.status().phase, 'ready');
  const result = await translation.translate(
    { text: 'Good morning.', direction: 'en-zh' },
    AbortSignal.timeout(120000),
  );
  assert.match(result.text, /早/);
  console.log('Independent model loading and translation passed:', result.text);
} finally {
  translation.stopTranslation();
  await engine.shutdown();
}
