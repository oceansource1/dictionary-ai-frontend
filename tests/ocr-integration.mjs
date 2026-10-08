import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const base = process.env.TEST_URL || 'http://127.0.0.1:3223';
async function call(path, data) {
  const r = await fetch(base + path, {
    method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(90000),
  });
  return { status: r.status, data: await r.json() };
}
async function image(name, language) {
  return call('/api/ocr', {
    image: (await readFile(new URL('./fixtures/' + name, import.meta.url))).toString('base64'),
    language,
  });
}
assert.equal((await call('/api/status')).data.phase, 'idle');
const en = await image('english.png', 'en');
assert.equal(en.status, 200);
assert.match(en.data.text, /Good morning/);
const enTranslation = await call('/api/translate', { text: en.data.text, direction: 'en-zh' });
assert.equal(enTranslation.status, 200);
assert.match(enTranslation.data.text, /早上/);
const zh = await image('chinese.png', 'zh');
assert.equal(zh.status, 200);
assert.match(zh.data.text, /星期五/);
const zhTranslation = await call('/api/translate', { text: zh.data.text, direction: 'zh-en' });
assert.equal(zhTranslation.status, 200);
assert.match(zhTranslation.data.text, /Friday/i);
assert.match(zhTranslation.data.text, /report/i);
const blank = await image('blank.png', 'en');
assert.equal(blank.status, 200);
assert.equal(blank.data.text, '');
assert.equal((await call('/api/ocr', { image: 'not base64', language: 'en' })).status, 400);
assert.equal((await call('/api/ocr', { image: 'YWJjZA==', language: 'en' })).status, 502);
const controller = new AbortController();
const pending = fetch(base + '/api/ocr', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image: (await readFile(new URL('./fixtures/chinese.png', import.meta.url))).toString('base64'),
    language: 'zh',
  }),
  signal: controller.signal,
});
setTimeout(() => controller.abort(), 10);
await assert.rejects(pending, { name: 'AbortError' });
await new Promise((r) => setTimeout(r, 250));
assert.equal((await image('english.png', 'en')).status, 200);
assert.equal((await call('/api/status')).data.phase, 'idle');
const result = {
  llmRemainedIdle: true,
  englishOCR: en.data.text,
  englishTranslation: enTranslation.data.text,
  chineseOCR: zh.data.text,
  chineseTranslation: zhTranslation.data.text,
  blankImageHandled: true,
  cancellationRecovered: true,
};
await writeFile('/tmp/local-lens-ocr-results.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
