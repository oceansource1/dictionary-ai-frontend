import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTranslation } from '../translation.mjs';
test('专用翻译只接受限定方向和有界文字输入', () => {
  assert.deepEqual(validateTranslation({ text: ' hello ', direction: 'en-zh' }), {
    text: 'hello',
    direction: 'en-zh',
  });
  for (const data of [
    { text: '', direction: 'en-zh' },
    { text: 'hello', direction: 'auto' },
    { text: 'a'.repeat(3001), direction: 'en-zh' },
    { text: 123, direction: 'en-zh' },
  ])
    assert.throws(() => validateTranslation(data));
});
