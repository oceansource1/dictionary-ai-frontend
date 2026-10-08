import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const base = process.env.TEST_URL || 'http://127.0.0.1:3221';
async function request(path, data) {
  return fetch(base + path, {
    method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(180000),
  });
}
async function chat(model, messages) {
  const r = await request('/api/chat', { model, messages });
  assert.equal(r.status, 200);
  const events = (await r.text())
    .trim()
    .split('\n')
    .map((x) => JSON.parse(x));
  assert.ok(events.at(-1).done, JSON.stringify(events.at(-1)));
  return events.map((e) => e.message?.content || '').join('');
}
const results = {};
results.status = await (await request('/api/status')).json();
assert.equal(results.status.phase, 'ready');
results.text = await chat('qwen3-vl:4b', [
  { role: 'user', content: '将 Good morning 翻译成简体中文，只输出译文。' },
]);
assert.match(results.text, /早/);
const image = (await readFile(new URL('./fixtures/english.png', import.meta.url))).toString(
  'base64',
);
results.image = await chat('qwen3-vl:4b', [
  {
    role: 'user',
    content: '识别截图中的英文，然后翻译为简体中文。分别列出原文和译文，保留 Local Lens 这个名称。',
    images: [image],
  },
]);
assert.match(results.image, /Good morning/i);
assert.match(results.image, /早/);
results.reverse = await chat('qwen3-vl:4b', [
  { role: 'user', content: '将「早上好，欢迎使用本地助手。」翻译成英文。只输出译文。' },
]);
assert.match(results.reverse, /good morning/i);
assert.equal(
  (
    await request('/api/chat', {
      model: 'deepseek-r1:8b',
      messages: [{ role: 'user', content: '看图', images: [image] }],
    })
  ).status,
  400,
);
assert.equal((await request('/api/search', { query: 'Ollama' })).status, 502);
results.deepseek = await chat('deepseek-r1:8b', [
  { role: 'user', content: 'What is 2 + 2? Answer briefly.' },
]);
assert.match(results.deepseek, /4|four/i);
const reload = await request('/api/load', { model: 'qwen3-vl:4b' });
assert.equal(reload.status, 200);
results.reloaded = await reload.json();
assert.equal(results.reloaded.model, 'qwen3-vl:4b');
await writeFile('/tmp/local-lens-offline-results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
