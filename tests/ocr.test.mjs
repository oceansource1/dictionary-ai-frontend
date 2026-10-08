import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOCR } from '../ocr.mjs';
test('OCR 接口只接受有界图片数据和明确语言，不接受远程图片地址', () => {
  assert.deepEqual(validateOCR({ image: 'YWJjZA==', language: 'zh' }), {
    image: 'YWJjZA==',
    language: 'zh',
  });
  for (const value of [
    { image: 'https://example.com/a.png', language: 'en' },
    { image: '', language: 'en' },
    { image: 'YWJjZA==', language: 'auto' },
  ])
    assert.throws(() => validateOCR(value));
});
