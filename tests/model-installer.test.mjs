import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createInstaller } from '../model-installer.mjs';
const content = Buffer.from('model fixture');
const entry = {
  id: 'test',
  title: 'Test',
  files: [
    {
      file: 'models/test.gguf',
      size: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
      url: 'https://example.invalid/model',
    },
  ],
};
test('安装必须通过校验，成功后可离线校验并删除；未知 ID 被拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lens-install-'));
  let downloads = 0;
  try {
    const installer = createInstaller({
      root,
      items: [entry],
      transfer: async (_, path) => {
        downloads++;
        await writeFile(path, content);
      },
    });
    assert.throws(() => installer.start('../escape'), /未知/);
    installer.start('test');
    assert.throws(() => installer.start('test'), /任务/);
    await installer.wait();
    assert.equal(installer.status().phase, 'complete');
    assert.equal((await installer.list())[0].installed, true);
    installer.start('test');
    await installer.wait();
    assert.equal(downloads, 1);
    await installer.remove('test');
    assert.equal((await installer.list())[0].installed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('错误哈希不发布模型；取消保留断点，重试完成安装', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lens-resume-'));
  try {
    const broken = createInstaller({
      root,
      items: [entry],
      transfer: async (_, path) => writeFile(path, 'wrong'),
    });
    broken.start('test');
    await broken.wait();
    assert.equal(broken.status().phase, 'error');
    assert.equal((await broken.list())[0].installed, false);
    let ready;
    const started = new Promise((resolve) => {
      ready = resolve;
    });
    const cancelled = createInstaller({
      root,
      items: [entry],
      transfer: async (_, path, signal) => {
        await writeFile(path, content.subarray(0, 4));
        ready();
        await new Promise((_, reject) => {
          const abort = () => reject(new Error('aborted'));
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        });
      },
    });
    cancelled.start('test');
    await started;
    cancelled.cancel();
    await cancelled.wait();
    assert.equal(cancelled.status().phase, 'cancelled');
    assert.equal((await readFile(join(root, 'models/test.gguf.part'))).length, 4);
    const resumed = createInstaller({
      root,
      items: [entry],
      transfer: async (_, path) => {
        assert.equal((await readFile(path)).length, 4);
        await writeFile(path, content);
      },
    });
    resumed.start('test');
    await resumed.wait();
    assert.equal(resumed.status().phase, 'complete');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
