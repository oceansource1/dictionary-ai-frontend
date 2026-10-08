import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRuntimeMessages, parseSSE } from '../engine.mjs';

test('图片以本地 base64 传递给推理引擎，保留多轮消息', () => {
  const result = toRuntimeMessages([
    { role: 'user', content: '译文', images: ['aGVsbG8='] },
    { role: 'assistant', content: 'hello' },
  ]);
  assert.equal(result[0].content[1].image_url.url, 'data:image/jpeg;base64,aGVsbG8=');
  assert.equal(result[1].content, 'hello');
});
test('SSE 解析能处理跨块 UTF-8、CRLF 与最终 DONE', async () => {
  const bytes = new TextEncoder().encode('data: {"text":"中文"}\r\n\r\ndata: [DONE]\n\n');
  async function* input() {
    for (let i = 0; i < bytes.length; i += 2) yield bytes.slice(i, i + 2);
  }
  const result = [];
  for await (const event of parseSSE(input())) result.push(event);
  assert.deepEqual(result, ['{"text":"中文"}', '[DONE]']);
});
