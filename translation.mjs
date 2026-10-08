import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
let worker, current, idleTimer;
let state = { phase: 'idle', direction: null, completed: 0, total: 0 };
export const translationStatus = () => ({ ...state });
export function validateTranslation(data) {
  if (!data || typeof data.text !== 'string' || !data.text.trim())
    throw new Error('请输入要翻译的句子或段落。');
  if (data.text.length > 3000) throw new Error('每次最多翻译 3000 个字符，请分段输入。');
  if (!['en-zh', 'zh-en'].includes(data.direction)) throw new Error('请选择英译中或中译英。');
  return { text: data.text.trim(), direction: data.direction };
}
function stopWorker() {
  const old = worker;
  worker = null;
  if (old && !old.killed) old.kill('SIGTERM');
  clearTimeout(idleTimer);
}
export function stopTranslation() {
  if (current) current.fail(new Error('翻译已停止'));
  stopWorker();
}
export function translate(data, signal) {
  const { text, direction } = validateTranslation(data);
  if (current) throw new Error('专用翻译引擎正在工作，请等待或停止当前翻译。');
  signal?.throwIfAborted();
  clearTimeout(idleTimer);
  if (!worker) {
    const p = fork(new URL('./translation-worker.mjs', import.meta.url), [], {
      execArgv: [],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' },
    });
    worker = p;
    let diagnostic = '';
    p.stderr.on('data', (chunk) => {
      diagnostic = (diagnostic + chunk.toString()).slice(-1500);
    });
    p.on('error', (error) => {
      if (worker === p) {
        worker = null;
        current?.fail(error);
      }
    });
    p.on('exit', (code) => {
      if (worker === p) {
        worker = null;
        current?.fail(new Error(`专用翻译引擎退出 (${code})。${diagnostic.slice(-1500)}`));
      }
    });
    p.on('message', (event) => {
      if (!current || event.id !== current.id) return;
      if (event.type === 'progress')
        state = {
          phase: event.phase,
          direction: state.direction,
          completed: event.completed,
          total: event.total,
        };
      if (event.type === 'result') current.finish(event);
      if (event.type === 'error') current.fail(new Error(event.error));
    });
  }
  state = { phase: 'loading', direction, completed: 0, total: 0 };
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    let timeout;
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      current = null;
      idleTimer = setTimeout(() => {
        stopWorker();
        state = { phase: 'idle', direction: null, completed: 0, total: 0 };
      }, 300000);
      idleTimer.unref();
    };
    const finish = (value) => {
      cleanup();
      state = { phase: 'ready', direction, completed: value.segments, total: value.segments };
      resolve(value);
    };
    const fail = (error) => {
      cleanup();
      state = { phase: 'error', direction, error: error.message };
      reject(error);
    };
    const abort = () => {
      stopWorker();
      fail(new Error('翻译已停止'));
    };
    current = { id, finish, fail };
    signal?.addEventListener('abort', abort, { once: true });
    timeout = setTimeout(() => {
      stopWorker();
      fail(new Error('翻译超时，请缩短输入后重试。'));
    }, 180000);
    worker.send({ id, text, direction });
  });
}
