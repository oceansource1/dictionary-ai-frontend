const dialog = document.getElementById('modelManager');
const cards = document.getElementById('modelManagerCards');
const status = document.getElementById('modelDownloadStatus');
const progress = document.getElementById('modelDownloadProgress');
const cancel = document.getElementById('cancelModelDownload');
let polling = false;
let signature = '';
let previousTask = '';
let active = false;
const gb = (bytes) => (bytes / 1e9).toFixed(2) + ' GB';
const running = (task) => task && ['preparing', 'downloading', 'verifying'].includes(task.phase);
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
async function request(data) {
  const response = await fetch(
    '/api/model-manager',
    data
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      : {},
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '模型管理请求失败');
  return result;
}
async function action(action, id) {
  try {
    await request({ action, id });
    signature = '';
    if (action === 'remove') window.dispatchEvent(new Event('model-install-complete'));
    await refresh();
  } catch (error) {
    status.textContent = error.message;
  }
}
function render(models, task) {
  const next = JSON.stringify([models, !!running(task)]);
  if (next === signature) return;
  signature = next;
  cards.replaceChildren();
  for (const model of models) {
    const card = element('article', '', 'model-manager-card');
    card.append(element('h3', model.title), element('p', model.description));
    if (model.guidance) {
      const guide = model.guidance;
      card.append(element('span', guide.badge, 'model-choice-badge'));
      card.append(element('p', '适合：' + guide.useCases));
      card.append(element('p', guide.memory, 'manager-hint'));
      card.append(
        element(
          'p',
          guide.verified ? '✓ 已做基础运行验证' : '待验证 · 此下载版本尚未实测',
          guide.verified ? 'model-verified' : 'model-unverified',
        ),
      );
      const details = element('details', '', 'model-guide');
      details.append(element('summary', '查看优势、局限与验证说明'));
      const list = element('dl');
      for (const [label, key] of [
        ['优势', 'strengths'],
        ['局限', 'limitations'],
        ['运行设置', 'settings'],
        ['速度与质量', 'performance'],
        ['验证范围', 'validation'],
      ]) {
        list.append(element('dt', label), element('dd', guide[key]));
      }
      details.append(list);
      card.append(details);
    }
    card.append(element('p', `${gb(model.total)} · ${model.installed ? '已安装' : '未安装'}`));
    if (model.source) {
      const link = element('a', '模型来源与许可');
      link.href = model.source;
      link.target = '_blank';
      link.rel = 'noreferrer';
      card.append(link);
    }
    const controls = element('div', '', 'manager-controls');
    const install = element('button', model.installed ? '校验 / 修复' : '下载并安装', 'send');
    install.disabled = !!running(task) || !model.downloadable;
    install.onclick = () => action('install', model.id);
    controls.append(install);
    if (model.installed) {
      const remove = element('button', '删除安装文件', 'tool-button');
      remove.disabled = !!running(task);
      let armed = false;
      remove.onclick = () => {
        if (!armed) {
          armed = true;
          remove.textContent = '再次点击确认删除';
          return;
        }
        action('remove', model.id);
      };
      controls.append(remove);
    }
    card.append(controls);
    cards.append(card);
  }
}
async function refresh() {
  if (polling) return;
  polling = true;
  try {
    const data = await request();
    active = !!running(data.task);
    render(data.models, data.task);
    const task = data.task;
    cancel.hidden = !active;
    progress.hidden = !active;
    if (task) {
      const labels = {
        preparing: '准备下载',
        downloading: '正在下载',
        verifying: '正在校验文件',
        complete: '安装完成',
        cancelled: '已取消',
        error: '安装失败',
      };
      status.textContent = `${task.id} · ${labels[task.phase]} · ${gb(task.downloaded)} / ${gb(task.total)}${task.message ? ' · ' + task.message : ''}`;
      progress.value = task.total ? Math.min(100, (100 * task.downloaded) / task.total) : 0;
      const key = task.id + ':' + task.phase;
      if (key !== previousTask && task.phase === 'complete')
        window.dispatchEvent(new Event('model-install-complete'));
      previousTask = key;
    } else status.textContent = '选择需要的模型，安装时请保持应用打开。';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    polling = false;
  }
}
document.getElementById('openModelManager').onclick = () => {
  dialog.showModal();
  refresh();
};
document.getElementById('closeModelManager').onclick = () => dialog.close();
cancel.onclick = () => action('cancel');
setInterval(() => {
  if (dialog.open || active) refresh();
}, 1500);
