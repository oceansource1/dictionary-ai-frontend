import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRegistry, inspectGGUF } from '../model-registry.mjs';
function gguf(arch) {
  const key = Buffer.from('general.architecture'),
    v = Buffer.from(arch);
  const b = Buffer.alloc(24 + 8 + key.length + 4 + 8 + v.length);
  b.write('GGUF');
  b.writeUInt32LE(3, 4);
  b.writeBigUInt64LE(1n, 16);
  let o = 24;
  b.writeBigUInt64LE(BigInt(key.length), o);
  o += 8;
  key.copy(b, o);
  o += key.length;
  b.writeUInt32LE(8, o);
  o += 4;
  b.writeBigUInt64LE(BigInt(v.length), o);
  o += 8;
  v.copy(b, o);
  return b;
}
test('扫描已有模型、去重、明确不兼容格式，重新扫描反映删除', async () => {
  const home = await mkdtemp(join(tmpdir(), 'lens-registry-'));
  try {
    const root = join(home, 'models');
    await mkdir(root);
    const builtin = gguf('llama');
    await writeFile(join(root, 'a.gguf'), builtin);
    const digest = 'a'.repeat(64),
      other = 'b'.repeat(64),
      blob = join(home, '.ollama/models/blobs');
    await mkdir(blob, { recursive: true });
    await writeFile(join(blob, 'sha256-' + digest), builtin);
    await writeFile(join(blob, 'sha256-' + other), gguf('qwen25vl'));
    for (const [name, d, size] of [
      ['test', digest, builtin.length],
      ['vision', other, gguf('qwen25vl').length],
    ]) {
      const dir = join(home, '.ollama/models/manifests/registry.ollama.ai/library', name);
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'latest'),
        JSON.stringify({
          layers: [
            { mediaType: 'application/vnd.ollama.image.model', digest: 'sha256:' + d, size },
          ],
        }),
      );
    }
    const r = createRegistry({
      home,
      modelRoot: root,
      catalog: {
        models: [{ name: 'test:latest', file: 'a.gguf', size: builtin.length, sha256: digest }],
      },
    });
    const list = await r.refresh();
    assert.equal(list.length, 2);
    assert.equal(list[1].available, false);
    assert.match(list[1].unavailable, /qwen25vl/);
    await rm(join(blob, 'sha256-' + other));
    assert.equal((await r.refresh()).length, 1);
    assert.ok(r.warnings().length);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
test('导入视觉模型会持久保存主模型与组件，拒绝非 GGUF 和两个主模型', async () => {
  const home = await mkdtemp(join(tmpdir(), 'lens-import-'));
  try {
    const main = join(home, 'main.gguf'),
      proj = join(home, 'mmproj.gguf');
    await writeFile(main, gguf('qwen3vl'));
    await writeFile(proj, gguf('clip'));
    const options = { home, modelRoot: home, catalog: { models: [] } };
    const r = createRegistry(options);
    const model = await r.importFiles([main, proj]);
    assert.equal(model.available, true);
    assert.deepEqual(model.capabilities, ['completion', 'vision']);
    assert.equal((await createRegistry(options).refresh())[0].name, model.name);
    await assert.rejects(r.importFiles([main, main]), /主模型/);
    await assert.rejects(r.importFiles(['https://example.com/a.gguf']));
    const bad = join(home, 'bad.gguf');
    await writeFile(bad, 'not a model');
    await assert.rejects(inspectGGUF(bad));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
test('独立模型目录优先于源码，未安装的清单条目不产生错误', async () => {
  const home = await mkdtemp(join(tmpdir(), 'lens-managed-'));
  try {
    const root = join(home, 'source'),
      managedRoot = join(home, 'managed');
    await mkdir(root);
    await mkdir(managedRoot);
    const data = gguf('llama');
    await writeFile(join(managedRoot, 'a.gguf'), data);
    const r = createRegistry({
      home,
      modelRoot: root,
      managedRoot,
      catalog: {
        models: [
          { name: 'installed', file: 'a.gguf', size: data.length },
          { name: 'optional', file: 'missing.gguf', size: 100 },
        ],
      },
    });
    const models = await r.refresh();
    assert.equal(models.length, 1);
    assert.equal(models[0].source, '已安装');
    assert.equal(models[0].file, await realpath(join(managedRoot, 'a.gguf')));
    assert.deepEqual(r.warnings(), []);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
