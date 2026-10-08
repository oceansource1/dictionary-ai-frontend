import { modelGuidance } from './model-guidance.mjs';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, stat, mkdir, rename, rm, statfs } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { dataRoot } from './data-paths.mjs';

async function size(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}
export async function curlTransfer(url, path, signal) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      '/usr/bin/curl',
      [
        '--fail',
        '--location',
        '--proto',
        '=https',
        '--proto-redir',
        '=https',
        '--retry',
        '3',
        '--connect-timeout',
        '30',
        '--speed-limit',
        '1024',
        '--speed-time',
        '120',
        '--continue-at',
        '-',
        '--silent',
        '--show-error',
        url,
        '--output',
        path,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let error = '';
    child.stderr.on('data', (chunk) => {
      error = (error + chunk).slice(-1500);
    });
    const abort = () => child.kill('SIGTERM');
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    child.on('error', reject);
    child.on('close', (code) => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(new Error('下载已取消，已保留断点'));
      else if (code !== 0) reject(new Error('下载失败，可重试：' + error));
      else resolve();
    });
  });
}
export function createInstaller({ root, items, transfer = curlTransfer }) {
  let controller, task, current;
  let removing = false;
  const item = (id) => {
    const found = items.find((entry) => entry.id === id);
    if (!found) throw new Error('未知模型');
    return found;
  };
  async function verify(path, file, signal) {
    if ((await size(path)) !== file.size) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) {
      signal?.throwIfAborted();
      hash.update(chunk);
    }
    return hash.digest('hex') === file.sha256;
  }
  async function run(selected, signal) {
    let completed = 0;
    try {
      await mkdir(root, { recursive: true });
      for (const file of selected.files) {
        signal.throwIfAborted();
        const destination = join(root, file.file),
          partial = destination + '.part';
        await mkdir(dirname(destination), { recursive: true });
        current.phase = 'verifying';
        current.file = file.file;
        if (!(await verify(destination, file, signal))) {
          if (!file.url) throw new Error('此模型没有下载源，请使用导入模型');
          if ((await size(partial)) > file.size) await rm(partial);
          if ((await size(partial)) !== file.size) {
            const disk = await statfs(root);
            const remaining = file.size - (await size(partial));
            if (disk.bavail * disk.bsize < remaining + 200 * 1024 * 1024)
              throw new Error('磁盘可用空间不足');
            current.phase = 'downloading';
            const timer = setInterval(async () => {
              const downloaded = await size(partial);
              if (current?.id === selected.id && current.phase === 'downloading')
                current.downloaded = completed + downloaded;
            }, 400);
            try {
              await transfer(file.url, partial, signal);
            } finally {
              clearInterval(timer);
            }
          }
          current.phase = 'verifying';
          if (!(await verify(partial, file, signal))) {
            await rm(partial, { force: true });
            throw new Error('文件校验失败，未安装。请重新下载。');
          }
          signal.throwIfAborted();
          await rename(partial, destination);
        }
        completed += file.size;
        current.downloaded = completed;
      }
      current.phase = 'complete';
      current.message = '安装完成，可以离线使用';
    } catch (error) {
      current.phase = signal.aborted ? 'cancelled' : 'error';
      current.message = signal.aborted ? '已取消，重试可续传' : error.message;
    } finally {
      controller = null;
    }
  }
  return {
    async list() {
      return Promise.all(
        items.map(async (selected) => ({
          id: selected.id,
          title: selected.title,
          description: selected.description,
          capabilities: selected.capabilities,
          total: selected.files.reduce((n, f) => n + f.size, 0),
          installed: (
            await Promise.all(
              selected.files.map(async (f) => (await size(join(root, f.file))) === f.size),
            )
          ).every(Boolean),
          downloadable: selected.files.every((f) => !!f.url),
          source: selected.source,
          guidance: modelGuidance[selected.id] || null,
        })),
      );
    },
    status: () => (current ? { ...current } : null),
    start(id) {
      if (controller || removing) throw new Error('已有模型管理任务，请等待或取消');
      const selected = item(id);
      if (!selected.files.every((f) => f.url)) throw new Error('此模型仅支持导入已有文件');
      controller = new AbortController();
      current = {
        id,
        phase: 'preparing',
        downloaded: 0,
        total: selected.files.reduce((n, f) => n + f.size, 0),
        message: '',
      };
      task = run(selected, controller.signal);
      return this.status();
    },
    cancel() {
      controller?.abort();
    },
    async wait() {
      await task;
    },
    async remove(id) {
      if (controller || removing) throw new Error('请先完成或取消当前任务');
      const selected = item(id);
      removing = true;
      try {
        for (const file of selected.files) {
          await rm(join(root, file.file), { force: true });
          await rm(join(root, file.file + '.part'), { force: true });
        }
        if (current?.id === id) current = null;
      } finally {
        removing = false;
      }
    },
  };
}
const catalog = JSON.parse(await readFile(new URL('./models/catalog.json', import.meta.url)));
const translations = JSON.parse(
  await readFile(new URL('./translation-models/manifest.json', import.meta.url)),
);
const items = catalog.models
  .filter((m) => m.source.startsWith('https://'))
  .map((model) => {
    const base = model.source.replace('/tree/', '/resolve/');
    const files = [
      {
        file: 'models/' + model.file,
        size: model.size,
        sha256: model.sha256,
        url: base + '/' + (model.fileRemote || model.file),
      },
    ];
    if (model.projector)
      files.push({
        file: 'models/' + model.projector,
        size: model.projectorSize,
        sha256: model.projectorSha256,
        url: base + '/' + (model.projectorRemote || model.projector),
      });
    return {
      id: model.name,
      title: model.label || model.name,
      description:
        model.description ||
        (model.capabilities.includes('vision')
          ? '聊天与图片问答 · 量化版，含视觉组件'
          : '文字问答与推理 · 不支持图片'),
      source: model.source,
      capabilities: model.capabilities,
      files,
    };
  });
items.push({
  id: 'translation',
  title: '中英离线词典翻译',
  description: 'OPUS-MT 专用翻译模型 · 搭配本地 OCR，无需聊天大模型',
  capabilities: ['translation'],
  files: translations.map((f) => ({ ...f, url: f.source })),
});
export const installer = createInstaller({ root: dataRoot, items });
