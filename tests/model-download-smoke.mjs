// Explicit opt-in network smoke test: downloads a small pinned translation config only.
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { createInstaller } from '../model-installer.mjs';
const root = await mkdtemp(join(tmpdir(), 'lens-download-smoke-'));
try {
  const [file] = JSON.parse(
    await readFile(new URL('../translation-models/manifest.json', import.meta.url)),
  );
  const manager = createInstaller({
    root,
    items: [{ id: 'smoke', title: 'Download test', files: [{ ...file, url: file.source }] }],
  });
  manager.start('smoke');
  await manager.wait();
  assert.equal(manager.status().phase, 'complete', manager.status().message);
  assert.equal((await manager.list())[0].installed, true);
  console.log('Real HTTPS download, checksum and atomic installation passed.');
} finally {
  await rm(root, { recursive: true, force: true });
}
