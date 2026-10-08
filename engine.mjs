import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { managedModelRoot, dataRoot } from './data-paths.mjs';
import { join } from 'node:path';
import { createRegistry } from './model-registry.mjs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const modelRoot = new URL('./models/', import.meta.url);
const binary = fileURLToPath(new URL('./runtime/llama-b11435/llama-server', import.meta.url));
const catalog = JSON.parse(await readFile(new URL('catalog.json', modelRoot), 'utf8'));
let child,
  loading,
  loaded,
  base,
  recentLog = '',
  failure,
  stopping = false;
let state = { phase: 'idle', model: null, error: null };
const key = randomBytes(32).toString('hex');
export const defaultModel = catalog.default;
export const status = () => ({ ...state });
const registry = createRegistry({
  modelRoot: fileURLToPath(modelRoot),
  catalog,
  managedRoot: managedModelRoot,
  importsFile: join(dataRoot, 'imported-models.json'),
});
export const modelWarnings = () => registry.warnings();
const publicModel = ({ file, projector, sha256, projectorSha256, ...entry }) => entry;
export async function listModels() {
  return (await registry.refresh()).map(publicModel);
}
export async function importModels(paths) {
  const result = await registry.importFiles(paths);
  return result ? publicModel(result) : null;
}
async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}
async function stopChild() {
  const old = child;
  child = null;
  loaded = null;
  if (!old || old.exitCode !== null || old.signalCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => old.kill('SIGKILL'), 4000);
    old.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    old.kill('SIGTERM');
  });
}
async function loadModel(name) {
  await listModels();
  const config = registry.get(name);
  if (!config) throw new Error('模型文件缺失或不完整，请重新扫描或导入。');
  if (!config.available) throw new Error(config.unavailable);
  state = { phase: 'loading', model: name, error: null };
  await stopChild();
  if (stopping) throw new Error('应用正在退出');
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  recentLog = '';
  failure = null;
  const args = [
    '--model',
    config.file,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--alias',
    name,
    '--ctx-size',
    String(config.contextSize),
    '--parallel',
    '1',
    '--threads',
    '6',
    '--n-gpu-layers',
    '99',
    '--offline',
    '--no-webui',
    '--no-ui-mcp-proxy',
    '--api-key',
    key,
    '--reasoning-format',
    'deepseek',
  ];
  if (config.projector) args.push('--mmproj', config.projector);
  if (config.fastVision)
    args.push(
      '--reasoning',
      'off',
      '--chat-template-kwargs',
      JSON.stringify({ enable_thinking: false }),
      '--batch-size',
      '512',
      '--ubatch-size',
      '128',
    );
  const p = spawn(binary, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR || '/tmp',
    },
  });
  child = p;
  for (const stream of [p.stdout, p.stderr])
    stream.on('data', (chunk) => {
      recentLog = (recentLog + chunk.toString()).slice(-12000);
    });
  p.on('error', (error) => {
    failure = error.message;
  });
  p.on('exit', (code) => {
    if (child === p) {
      failure = `引擎已退出 (${code})`;
      child = null;
      loaded = null;
      state = { phase: 'error', model: name, error: failure };
    }
  });
  const deadline = Date.now() + 180000;
  try {
    while (Date.now() < deadline) {
      if (stopping) throw new Error('应用正在退出');
      if (failure || p.exitCode !== null || p.signalCode !== null)
        throw new Error(`本地引擎启动失败：${failure || '进程结束'}。${recentLog.slice(-1600)}`);
      try {
        const response = await fetch(base + '/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(1500),
        });
        if (response.ok) {
          const body = await response.json();
          if (body.data?.some((m) => m.id === name)) {
            loaded = name;
            state = { phase: 'ready', model: name, error: null };
            return;
          }
        }
      } catch {}
      await delay(350);
    }
    throw new Error('加载模型超时，请关闭其他占内存的应用后重试。');
  } catch (error) {
    await stopChild();
    state = { phase: 'error', model: name, error: error.message };
    throw error;
  }
}
export async function ensureModel(name) {
  if (stopping) throw new Error('应用正在退出');
  if (loaded === name && child) return;
  if (loading) {
    await loading;
    if (loaded === name) return;
    return ensureModel(name);
  }
  loading = loadModel(name);
  try {
    await loading;
  } finally {
    loading = null;
  }
}
export function toRuntimeMessages(messages) {
  return messages.map((m) => ({
    role: m.role,
    content: m.images?.length
      ? [
          { type: 'text', text: m.content },
          ...m.images.map((image) => ({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${image}` },
          })),
        ]
      : m.content,
  }));
}
export async function* parseSSE(chunks) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of chunks) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trimEnd();
      buffer = buffer.slice(index + 1);
      if (line.startsWith('data:')) yield line.slice(5).trimStart();
    }
  }
  buffer += decoder.decode();
  if (buffer.startsWith('data:')) yield buffer.slice(5).trim();
}
export async function* chat(name, messages, signal) {
  await ensureModel(name);
  signal.throwIfAborted();
  const response = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: name,
      messages: toRuntimeMessages(messages),
      stream: true,
      max_tokens: 4096,
      temperature: 0.25,
    }),
    signal,
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`本地模型请求失败：${error.slice(0, 800)}`);
  }
  let finished = false;
  for await (const data of parseSSE(response.body)) {
    if (data === '[DONE]') {
      finished = true;
      yield { done: true };
      break;
    }
    if (!data) continue;
    const event = JSON.parse(data);
    if (event.error) throw new Error(event.error.message || String(event.error));
    const choice = event.choices?.[0];
    if (!choice) continue;
    yield {
      message: {
        content: choice.delta?.content || '',
        thinking: choice.delta?.reasoning_content || '',
      },
      done: false,
    };
    if (choice.finish_reason === 'length')
      yield { message: { content: '\n\n[已达到本次输出长度限制，可继续追问。]' }, done: false };
  }
  if (!finished) throw new Error('本地推理连接提前结束，请重试。');
}
export async function shutdown() {
  stopping = true;
  await stopChild();
}

export async function unloadModel(name) {
  if (loading) throw new Error('模型正在加载，请稍后再删除');
  if (state.model !== name) return;
  await stopChild();
  state = { phase: 'idle', model: null, error: null };
}
