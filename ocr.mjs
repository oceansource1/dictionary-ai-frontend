import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const executable = fileURLToPath(new URL('./local-ocr', import.meta.url));
const processes = new Set();
export function validateOCR(data) {
  if (
    !data ||
    typeof data.image !== 'string' ||
    data.image.length > 28 * 1024 * 1024 ||
    !data.image ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data.image)
  )
    throw new Error('图片数据无效或超过 20 MB。');
  if (!['en', 'zh'].includes(data.language)) throw new Error('请选择图片原文语言。');
  return { image: data.image, language: data.language };
}
export function stopOCR() {
  for (const p of processes) p.kill('SIGTERM');
}
export async function recognizeImage(data, signal) {
  const payload = validateOCR(data);
  signal?.throwIfAborted();
  if (processes.size) throw new Error('正在识别图片，请等待完成后再试。');
  return new Promise((resolve, reject) => {
    const process = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    processes.add(process);
    let output = '',
      diagnostic = '',
      settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(result);
    };
    const abort = () => {
      process.kill('SIGTERM');
      finish(new Error('文字识别已停止。'));
    };
    const timer = setTimeout(() => {
      process.kill('SIGKILL');
      finish(new Error('文字识别超时，请缩小截图区域后重试。'));
    }, 45000);
    signal?.addEventListener('abort', abort, { once: true });
    process.stdout.setEncoding('utf8');
    process.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.length > 2 * 1024 * 1024) {
        process.kill('SIGKILL');
        finish(new Error('识别结果过长，请缩小截图范围。'));
      }
    });
    process.stderr.on('data', (chunk) => {
      diagnostic = (diagnostic + chunk.toString()).slice(-800);
    });
    process.on('error', (error) => {
      processes.delete(process);
      finish(new Error('本地文字识别引擎无法启动：' + error.message));
    });
    process.stdin.on('error', () => {});
    process.on('close', (code) => {
      processes.delete(process);
      try {
        const result = JSON.parse(output);
        if (code !== 0 || result.error)
          throw new Error(result.error || diagnostic || '图片识别失败。');
        finish(null, result);
      } catch (error) {
        finish(
          new Error(
            error.message.startsWith('Unexpected')
              ? '文字识别未返回有效结果，请重新截取清晰图片。'
              : error.message,
          ),
        );
      }
    });
    process.stdin.end(JSON.stringify(payload));
  });
}
