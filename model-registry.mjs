import {
  readFile,
  writeFile,
  mkdir,
  rename,
  readdir,
  stat,
  open,
  realpath,
} from 'node:fs/promises';
import { join, basename, dirname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

// Read only a bounded GGUF header; never load multi-GB weights into JS memory.
export async function inspectGGUF(path) {
  const handle = await open(path, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('请选择模型文件');
    const buffer = Buffer.alloc(Math.min(info.size, 1024 * 1024));
    await handle.read(buffer, 0, buffer.length, 0);
    if (buffer.toString('ascii', 0, 4) !== 'GGUF' || ![2, 3].includes(buffer.readUInt32LE(4)))
      throw new Error('不是受支持的 GGUF 文件');
    let offset = 24;
    const count = Number(buffer.readBigUInt64LE(16));
    const need = (n) => {
      if (offset + n > buffer.length) throw new Error('GGUF 元数据过大或文件不完整');
    };
    const u32 = () => {
      need(4);
      const v = buffer.readUInt32LE(offset);
      offset += 4;
      return v;
    };
    const u64 = () => {
      need(8);
      const v = Number(buffer.readBigUInt64LE(offset));
      offset += 8;
      if (!Number.isSafeInteger(v)) throw new Error('GGUF 长度无效');
      return v;
    };
    const str = () => {
      const n = u64();
      need(n);
      const v = buffer.toString('utf8', offset, offset + n);
      offset += n;
      return v;
    };
    const value = (type, depth = 0) => {
      if (depth > 2) throw new Error('GGUF 元数据无效');
      if (type === 8) return str();
      if (type === 9) {
        const t = u32(),
          n = u64();
        if (n > 1000000) throw new Error('GGUF 数组过大');
        for (let i = 0; i < n; i++) value(t, depth + 1);
        return;
      }
      const n = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 }[type];
      if (!n) throw new Error('GGUF 类型无效');
      need(n);
      offset += n;
    };
    for (let i = 0; i < Math.min(count, 10000); i++) {
      const key = str(),
        type = u32(),
        v = value(type);
      if (key === 'general.architecture' && typeof v === 'string')
        return { architecture: v, size: info.size };
    }
    throw new Error('未找到 GGUF 模型架构');
  } finally {
    await handle.close();
  }
}
async function walk(root, depth = 0) {
  if (depth > 5) return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const result = [];
  for (const e of entries.slice(0, 2000)) {
    const path = join(root, e.name);
    if (e.isDirectory()) result.push(...(await walk(path, depth + 1)));
    else if (e.isFile()) result.push(path);
  }
  return result;
}
export function createRegistry({
  modelRoot,
  catalog,
  managedRoot,
  home = homedir(),
  importsFile = join(home, 'Library/Application Support/Local Lens/imported-models.json'),
} = {}) {
  let entries = new Map(),
    warnings = [],
    refreshing,
    writing = Promise.resolve();
  const id = (path) => 'local:' + createHash('sha256').update(path).digest('hex').slice(0, 16);
  async function imports() {
    try {
      const data = JSON.parse(await readFile(importsFile, 'utf8'));
      if (!Array.isArray(data)) throw new Error('模型清单格式错误');
      return data;
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }
  async function scan() {
    const next = new Map(),
      seen = new Set();
    warnings = [];
    async function add(entry) {
      try {
        entry.file = await realpath(entry.file);
        if (seen.has(entry.file)) return;
        const meta = await inspectGGUF(entry.file);
        if (entry.size && entry.size !== meta.size) throw new Error('模型文件不完整');
        entry.size = meta.size;
        entry.architecture = meta.architecture;
        if (entry.projector) {
          entry.projector = await realpath(entry.projector);
          const p = await inspectGGUF(entry.projector);
          if (!['clip', 'siglip'].includes(p.architecture))
            throw new Error('视觉组件不是 mmproj 模型');
          if (entry.projectorSize && entry.projectorSize !== p.size)
            throw new Error('视觉组件不完整');
          entry.size += p.size;
        }
        entry.capabilities = ['completion', ...(entry.projector ? ['vision'] : [])];
        if (['clip', 'siglip'].includes(meta.architecture)) return;
        if (meta.architecture === 'qwen25vl')
          entry.unavailable =
            '此文件使用 Ollama 的 qwen25vl 打包格式，当前内置引擎不能直接加载；需转换为 llama.cpp GGUF 并配套 mmproj。';
        else if (/vl|vision/i.test(meta.architecture) && !entry.projector)
          entry.unavailable =
            '缺少配套 mmproj 视觉组件，请使用“导入视觉模型”同时选择主模型和组件。';
        entry.available = !entry.unavailable;
        entry.contextSize = entry.contextSize || (entry.size > 7e9 ? 4096 : 8192);
        entry.note = entry.size > 7e9 ? '内存占用较高，使用 4096 上下文' : '';
        seen.add(entry.file);
        next.set(entry.name, entry);
      } catch (e) {
        warnings.push(`${entry.label || entry.name}：${e.message}`);
      }
    }
    for (const m of catalog.models) {
      let root = modelRoot;
      if (managedRoot) {
        try {
          await stat(join(managedRoot, m.file));
          root = managedRoot;
        } catch {}
      }
      try {
        await stat(join(root, m.file));
      } catch {
        continue;
      }
      await add({
        ...m,
        file: join(root, m.file),
        projector: m.projector ? join(root, m.projector) : undefined,
        label: m.name,
        source: root === managedRoot ? '已安装' : '本地文件',
      });
    }
    for (const path of await walk(join(home, '.ollama/models/manifests'))) {
      try {
        const manifest = JSON.parse(await readFile(path, 'utf8'));
        const layer = manifest.layers?.find(
          (l) => l.mediaType === 'application/vnd.ollama.image.model',
        );
        if (!layer) continue;
        const digestPath = (digest) => {
          if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error('模型摘要无效');
          return join(home, '.ollama/models/blobs', digest.replace(':', '-'));
        };
        const name = basename(dirname(path)) + ':' + basename(path);
        if (catalog.models.some((m) => m.sha256 === layer.digest.slice(7)) && next.has(name))
          continue;
        const projector = manifest.layers.find(
          (l) => l.mediaType === 'application/vnd.ollama.image.projector',
        );
        await add({
          name: next.has(name) ? id(path) : name,
          label: name,
          file: digestPath(layer.digest),
          size: layer.size,
          projector: projector ? digestPath(projector.digest) : undefined,
          projectorSize: projector?.size,
          source: '本机已有文件',
        });
      } catch (e) {
        warnings.push(`${basename(dirname(path))}：${e.message}`);
      }
    }
    try {
      for (const m of await imports())
        await add({ ...m, name: id(m.file), label: basename(m.file), source: '手动导入' });
    } catch (e) {
      warnings.push('导入清单读取失败：' + e.message);
    }
    for (const path of await walk(join(home, '.lmstudio/models'))) {
      if (path.endsWith('.gguf') && !/mmproj|\d{5}-of-\d{5}/i.test(basename(path)))
        await add({ name: id(path), label: basename(path), file: path, source: 'LM Studio 文件' });
    }
    entries = next;
    return [...entries.values()];
  }
  return {
    async refresh() {
      if (!refreshing) refreshing = scan().finally(() => (refreshing = null));
      return refreshing;
    },
    get(name) {
      return entries.get(name);
    },
    warnings() {
      return warnings;
    },
    async importFiles(paths) {
      if (
        !Array.isArray(paths) ||
        paths.length < 1 ||
        paths.length > 2 ||
        paths.some(
          (p) => typeof p !== 'string' || !isAbsolute(p) || !p.toLowerCase().endsWith('.gguf'),
        )
      )
        throw new Error('请选择一个 GGUF 主模型，可同时选择一个 mmproj 组件');
      const files = await Promise.all(
        paths.map(async (p) => ({ file: await realpath(p), ...(await inspectGGUF(p)) })),
      );
      const mains = files.filter((f) => !['clip', 'siglip'].includes(f.architecture)),
        projectors = files.filter((f) => ['clip', 'siglip'].includes(f.architecture));
      if (mains.length !== 1 || projectors.length > 1)
        throw new Error('每次导入一个主模型，视觉模型需同时选择配套 mmproj');
      const record = { file: mains[0].file, projector: projectors[0]?.file };
      const task = writing.then(async () => {
        const records = await imports();
        const next = records.filter((r) => r.file !== record.file);
        next.push(record);
        await mkdir(dirname(importsFile), { recursive: true });
        const temp = importsFile + '.tmp';
        await writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
        await rename(temp, importsFile);
      });
      writing = task.catch(() => {});
      await task;
      await this.refresh();
      return [...entries.values()].find((m) => m.file === record.file);
    },
  };
}
