import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
const manifest = JSON.parse(
  await readFile(new URL('../translation-models/manifest.json', import.meta.url)),
);
for (const entry of manifest) {
  const path = new URL('../' + entry.file, import.meta.url);
  if ((await stat(path)).size !== entry.size) throw new Error('专用翻译文件不完整：' + entry.file);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest('hex') !== entry.sha256) throw new Error('专用翻译文件校验失败：' + entry.file);
}
console.log('专用翻译模型校验通过');
