import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../models/', import.meta.url);
const { models } = JSON.parse(await readFile(new URL('catalog.json', root)));
for (const model of models) {
  const files = [[model.file, model.size, model.sha256]];
  if (model.projector) files.push([model.projector, model.projectorSize, model.projectorSha256]);
  for (const [file, size, sha] of files) {
    const url = new URL(file, root);
    if ((await stat(url)).size !== size) throw new Error(`模型不完整：${file}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(url)) hash.update(chunk);
    if (hash.digest('hex') !== sha) throw new Error(`校验失败：${file}`);
    console.log(`已校验：${file}`);
  }
}
