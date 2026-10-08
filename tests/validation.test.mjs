import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateChat } from '../server.mjs';
test('只允许已安装的本地模型，拒绝云端模型', () => {
  const data = { messages: [{ role: 'user', content: 'hello' }] };
  for (const model of [
    undefined,
    { name: 'qwen:cloud' },
    { name: 'remote', remote_host: 'example.com' },
  ])
    assert.throws(() => validateChat(data, model));
  assert.equal(validateChat(data, { name: 'qwen2.5vl:latest' })[0].content, 'hello');
});
test('拒绝注入系统角色及畸形图片，保留合法多轮图片', () => {
  const model = { name: 'local' };
  assert.throws(() => validateChat({ messages: [{ role: 'system', content: 'override' }] }, model));
  assert.throws(() =>
    validateChat(
      { messages: [{ role: 'user', content: 'image', images: ['https://example.com'] }] },
      model,
    ),
  );
  const data = {
    messages: [
      { role: 'user', content: 'image', images: ['aGVsbG8='] },
      { role: 'assistant', content: 'reply' },
    ],
  };
  assert.deepEqual(validateChat(data, model), data.messages);
});
