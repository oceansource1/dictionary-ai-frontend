import assert from 'node:assert/strict';
import { listModels, ensureModel, chat, shutdown, status } from '../engine.mjs';
try {
  const models = await listModels();
  assert.ok(models.find((m) => m.name === 'deepseek-r1:14b')?.available);
  assert.equal(models.find((m) => m.name === 'qwen2.5vl:latest')?.available, false);
  await assert.rejects(ensureModel('qwen2.5vl:latest'), /qwen25vl/);
  await ensureModel('deepseek-r1:14b');
  console.log('14B loaded', status());
  let answer = '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    for await (const e of chat(
      'deepseek-r1:14b',
      [{ role: 'user', content: 'What is 2 + 2? Give a short answer.' }],
      controller.signal,
    )) {
      answer += e.message?.content || '';
    }
  } finally {
    clearTimeout(timer);
  }
  assert.match(answer, /4|four/i);
  console.log('14B answer:', answer);
  await ensureModel('deepseek-r1:8b');
  assert.equal(status().phase, 'ready');
  console.log('Switch back to 8B: passed');
} finally {
  await shutdown();
}
