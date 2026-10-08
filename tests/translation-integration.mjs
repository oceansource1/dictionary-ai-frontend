import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base = process.env.TEST_URL || 'http://127.0.0.1:3222';
const call = async (path, data) => {
  const r = await fetch(base + path, {
    method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(180000),
  });
  return { status: r.status, data: await r.json() };
};
assert.equal((await call('/api/status')).data.phase, 'idle');
const en = await call('/api/translate', {
  text: 'Please send me the report before Friday.\n\nI would like to book a room for two nights.',
  direction: 'en-zh',
});
assert.equal(en.status, 200);
assert.match(en.data.text, /报告/);
assert.match(en.data.text, /\n\n/);
assert.match(en.data.text, /房/);
const zh = await call('/api/translate', {
  text: '今天天气很好，我们去公园散步吧。',
  direction: 'zh-en',
});
assert.equal(zh.status, 200);
assert.match(zh.data.text, /park/i);
assert.equal(
  (await call('/api/translate', { text: 'a'.repeat(3001), direction: 'en-zh' })).status,
  400,
);
assert.equal((await call('/api/status')).data.phase, 'idle');
const controller = new AbortController();
const pending = fetch(base + '/api/translate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'Please send me the report before Friday. '.repeat(60),
    direction: 'en-zh',
  }),
  signal: controller.signal,
});
setTimeout(() => controller.abort(), 100);
await assert.rejects(pending, { name: 'AbortError' });
await new Promise((r) => setTimeout(r, 200));
const recovered = await call('/api/translate', { text: '谢谢你的帮助。', direction: 'zh-en' });
assert.equal(recovered.status, 200);
assert.match(recovered.data.text, /thank/i);
const result = {
  llmRemainedIdle: true,
  englishToChinese: en.data.text,
  chineseToEnglish: zh.data.text,
  cancellationRecovery: recovered.data.text,
};
await writeFile('/tmp/local-lens-translation-results.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
