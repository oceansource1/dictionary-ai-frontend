# Local Lens

macOS 本地桌面聊天、看图问答与离线中英截图翻译。Swift + WKWebView 桌面窗口，Node.js 本地服务，llama.cpp/Metal 推理。无需 Ollama。聊天仅在用户开启联网搜索时请求外网；词典使用 Apple Vision OCR + OPUS-MT 专用翻译模型。

**源码与模型分离。仓库不包含模型权重、运行时二进制、个人聊天记录或安装包。** 当前桌面构建面向 Apple Silicon Mac，要求 macOS 13+、Node.js 22+、Python 3、Xcode Command Line Tools。运行应用不需要额外安装 Node.js。

## 下载后的完整流程（首次使用）

### 1. 确认电脑要求

目前只提供 Apple Silicon Mac（M1/M2/M3/M4 等）的桌面构建，不支持直接在 Windows 或 Intel Mac 上运行此构建脚本。macOS 13 或以上；8B/9B 模型建议 16GB 及以上统一内存。先准备足够磁盘空间：程序及构建依赖需要额外空间，模型约 0.24–6.6GB/个。

### 2. 下载源码并准备开发工具

在 GitHub 项目页面选择 **Code → Download ZIP**，解压到本机文件夹。打开“终端”，输入 `cd `（注意空格），把解压后的项目文件夹拖进终端，按回车。后续命令都在包含 `package.json` 的目录执行。

安装 Node.js 22 或以上版本（包含 npm）、Python 3，以及 Apple 命令行工具。Node.js 和 Python 可从各自官方网站安装。Apple 工具通过以下命令安装；弹出系统窗口后完成安装再继续：

```sh
xcode-select --install
```

检查是否准备好：

```sh
node --version
npm --version
python3 --version
xcrun --find swiftc
```

### 3. 安装程序依赖与推理引擎

```sh
npm ci
npm run setup:runtime
```

此步骤需要网络。引擎来自 llama.cpp 官方固定版本，下载后验证 SHA-256。无需安装或启动 Ollama。

### 4. 构建并打开桌面应用

```sh
npm run build:desktop
open "dist/Local Lens.app"
```

构建不要求已经下载模型。也可以在 Finder 中双击 `dist/Local Lens.app`，或者双击 `start.command`。模型为空时出现安装提示是正常现象，继续下一步。

### 5. 在应用中安装模型

1. 点击左侧 **模型管理**。
2. 首次推荐安装 **qwen3-vl:4b**（聊天、看图，约 3.33GB）。如果主要需要文字推理，可以选择 **DeepSeek-R1 Distill 8B**（约 4.92GB，不支持看图）。
3. 需要词典整句翻译或词典截图翻译，再安装 **中英离线词典翻译**（约 0.24GB）。它独立于聊天模型。
4. 点击“下载并安装”，保持应用打开，等待进度和 SHA-256 校验完成。视觉模型的 mmproj 会一起安装。每次只进行一个安装任务。
5. 可以取消下载；已下载部分保留，下次点击安装会续传。网络失败可直接重试。关闭应用会取消当前任务。
6. 显示“安装完成”后关闭管理窗口，主界面模型列表自动刷新，选择模型，等待“本地模型已就绪”。

只在点击安装时请求模型下载站点；该行为独立于聊天页的“联网搜索”开关。已安装资源的“校验 / 修复”会先检查本地内容，损坏或缺失时才下载。界面上的“已安装”根据文件是否齐全判断，完整哈希验证在安装和修复时执行。

### 6. 开始使用

- **聊天问答**：选择模型，输入问题发送。视觉模型支持上传、粘贴、拖放图片。
- **截图翻译**：选择支持图片的模型，点击截屏后框选区域。
- **词典翻译**：安装专用翻译资源后，可直接输入句子或点击页内“截图翻译”，由本地 OCR 识别再翻译。
- 首次框选屏幕时，按 macOS 提示在“系统设置 → 隐私与安全性 → 屏幕录制”中授权 Local Lens；必要时退出重开。上传图片不需要录屏权限。
- 安装完成后断网也能聊天、看图和词典翻译。联网搜索只有手动开启才使用。

### 7. 以后启动、升级与卸载模型

可将 `.app` 拖入“应用程序”文件夹，以后直接双击。运行构建好的应用不需要开发工具。模型放在用户数据目录，替换应用不会重新下载。

源码升级后重新执行 `npm ci` 和 `npm run build:desktop`，旧应用会改名保留在 `dist/`，确认新版可用后自行清理备份。

删除模型：打开“模型管理”，点击“删除安装文件”，再点击一次确认。空闲的当前聊天模型会先卸载再删除；正在回答、加载或翻译时需等待完成。删除只处理本应用管理的权重与下载断点，不删除外部导入文件或 Ollama/LM Studio 文件。安装脚本与应用管理器请勿同时操作同一个模型目录。

## 怎么选择模型：优势、局限与验证情况

模型管理卡片提供选择标签、适用场景、内存参考，以及可展开的“优势、局限与验证说明”。这些说明针对清单中的具体量化版本；不是参数排行榜，也不把发布方宣传当成本机测试结果。

| 选项                   | 适合与优势                                   | 主要局限                                                   | 当前验证情况                                         |
| ---------------------- | -------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Qwen3-VL-4B            | 新手默认；中文问答、截图；视觉选项中体积较小 | 复杂推理、小字、表格需核对                                 | 本机已验证文字、图片与切换                           |
| MiniCPM-V-4.5          | 视觉备选；截图和图片文字问答                 | 可能遗漏要求的原文或格式；不是专业 OCR                     | 本机已验证截图翻译、加载与切换                       |
| Qwen3.5-9B             | 较大视觉选项；文字图片综合问答               | 需要更多权重存储及内存余量；不能由规模推断质量领先         | 本机已验证截图翻译、加载与切换                       |
| DeepSeek-R1 Distill 8B | 纯文字推理候选；不需要视觉组件               | 不支持图片；思考可能较长                                   | **公开下载版待验证**；旧本地 8B 测试不等于此文件已测 |
| 中英离线词典翻译       | 体积小；无需聊天模型；整句翻译和 OCR 衔接    | 不回答问题；专名、否定、复杂句甚至短句都可能误译或添加内容 | 已验证双向翻译、OCR 衔接、取消恢复                   |

已验证项目使用 M3 Pro / 18GB Mac，只是基础功能验证，未进行统一中文质量、峰值内存或速度基准测试。卡片中的建议内存是选型参考，不是可保证的最低要求。图片大小、对话长度和其他软件占用都会影响表现。

后续新增一键下载选项，应先验证具体主模型、视觉组件、对话模板和切换，再填写验证说明。保留现有 DeepSeek 下载候选，但明确标注未实测；此次没有新增其他未验证型号。其他 GGUF 仍可手动导入。

## 常见问题

| 现象                              | 处理                                                           |
| --------------------------------- | -------------------------------------------------------------- |
| `npm` / `node` / `python3` 找不到 | 完成对应工具安装，重新打开终端，并用版本命令确认               |
| `swiftc` 找不到                   | 完成 `xcode-select --install` 系统安装流程                     |
| 下载失败、连接超时                | 检查能否访问 GitHub / Hugging Face，网络恢复后重试；断点会保留 |
| 文件校验失败                      | 安装器不会启用失败文件，点击安装重新下载                       |
| 模型列表为空                      | 打开“模型管理”安装聊天模型，或通过“导入模型”选择 GGUF          |
| 模型已下载但不能看图              | DeepSeek 等文字模型不支持图片；选择标有“支持图片”的模型        |
| 词典提示缺少模型                  | 在“模型管理”安装“中英离线词典翻译”，聊天模型不能替代它         |
| 加载慢或内存不足                  | 关闭占内存的软件，改用 4B 模型、缩小图片或开启新对话           |
| 本地服务无法启动                  | 退出其他 Local Lens 实例，确认本机 3219 端口未被其他程序占用   |

## 模型安装与后续扩展

```sh
python3 scripts/models.py list
python3 scripts/models.py install minicpm-v:4.5 qwen3.5:9b
python3 scripts/models.py install translation
python3 scripts/models.py install deepseek-r1-distill:8b
```

默认存放于 `~/Library/Application Support/Local Lens/`，聊天权重位于 `models/`，翻译资源位于 `translation-models/`。更新应用不覆盖此目录。可用 `LOCAL_LENS_DATA_DIR` 环境变量改变服务数据目录；安装脚本支持同名环境变量或 `--data-dir` 参数。

| 模型                   | 含视觉组件的磁盘大小 | 用途                           |
| ---------------------- | -------------------: | ------------------------------ |
| Qwen3-VL-4B            |              3.33 GB | 默认轻量聊天和看图             |
| MiniCPM-V-4.5          |              6.12 GB | 视觉问答                       |
| Qwen3.5-9B             |              6.60 GB | 视觉问答                       |
| DeepSeek-R1-8B         |              4.92 GB | 旧本地副本，仅用于已有文件兼容 |
| DeepSeek-R1 Distill 8B |              4.92 GB | 可从管理页下载的文字推理模型   |
| OPUS-MT 双向翻译       |              0.24 GB | 词典整句翻译，不调用聊天模型   |

MiniCPM 和 Qwen3.5 默认关闭深度思考、使用 4096 上下文以控制内存压力。每次只加载一个聊天模型。磁盘大小不等于峰值内存；实际速度取决于硬件和图片尺寸。

添加模型有两种方式：

- 在应用中点「导入模型」，选择 GGUF；视觉模型同时选择配套 mmproj。只记录路径，不复制，原文件移动后需重新导入。
- 给 `models/catalog.json` 增加条目：唯一名称、文件名、大小、SHA-256、固定版本的 Hugging Face `source`，视觉组件及其校验值。远程文件名不同可指定 `fileRemote` / `projectorRemote`。然后用 `models.py install 模型名` 安装。无下载源的模型仅支持已有文件导入。

新架构可能需要更新引擎及模板适配，并非任意 GGUF 都兼容。应用还会扫描 `~/.ollama/models/manifests` 与 `~/.lmstudio/models`，无需启动它们的服务。旧 Ollama `qwen25vl` 打包格式会显示为暂不兼容。

模型管理页提供下载、进度、取消、校验 / 修复和删除；也可以使用上面的命令行安装方式。两个 DeepSeek 8B 条目来自不同文件版本：已有本地副本保留，公开下载版采用固定版本和独立文件名，不覆盖原文件。

## 从旧版内置模型迁移

在保留原 `models/`、`translation-models/` 的源码目录运行：

```sh
npm run models:migrate
```

此命令仅复制已有且校验通过的模型到独立数据目录，不联网、不删除原文件。macOS 尽可能使用 APFS 克隆。然后重建应用。构建脚本不会打包权重，并将上次 `.app` 改名保留在 `dist/` 中，避免旧模型残留到新包里。确认新版本工作后，可自行清理备份。开发模式仍可读取源码目录中的模型。

## 使用

- 聊天支持单张图片上传、粘贴、拖放及原生框选截图。
- 「截图翻译」使用所选视觉大模型。
- 「词典翻译」使用 Apple Vision OCR + OPUS-MT，支持截图后自动翻译和编辑原文；不调用大语言模型或在线翻译 API。
- 图片支持 PNG/JPEG/WebP，最多 20 MB；词典原文最多 3000 字。模型与 OCR 可能有误，专名、表格、小字需核对。
- 界面服务仅监听本机，推理服务使用随机本机端口和密钥。退出应用会停止自己的后台服务。聊天记录保存在本机 WKWebView 数据存储中，不进入源码仓库。

## 上传 GitHub

`.gitignore` 排除模型、`node_modules/`、`runtime/` 二进制、`dist/`、缓存、日志和 `.env`。不要用 `git add -f` 强制提交这些目录。

```sh
npm run export:source
```

生成 `release/local-lens-source.zip`：按明确白名单打包源码与模型清单，不包含权重。可解压后作为新仓库内容，也可以直接在当前目录创建 Git 仓库：

```sh
git init
git add .
git status --short
# 检查待提交内容后，再创建提交、关联自己的远程仓库并推送。
```

`.gitignore` 不会移除以前已提交的权重；如果合并到已有仓库，应先检查索引和历史。本项目不会自动创建远程仓库或推送。安装包可单独通过 GitHub Releases 发布，勿提交进源码历史。模型从原发布方下载，不使用 Git LFS 存放本项目模型副本。

## 开发与验证

```sh
npm test
npm start
```

开发服务默认 `http://127.0.0.1:3210`，桌面服务使用 3219。原生 OCR 需编译 `desktop/OCR.swift` 为根目录 `local-ocr`，或通过桌面构建使用；原生截图仅桌面版可用。离线集成测试需要已安装模型，参见 `tests/`。`tests/discovery-offline.sb` 阻止外网和 Ollama 服务，仅允许内部回环通信。

主要文件：`engine.mjs` 推理管理、`model-registry.mjs` 扫描导入、`data-paths.mjs` 数据目录、`models/catalog.json` 聊天模型清单、`translation-models/manifest.json` 翻译资源清单、`scripts/models.py` 安装迁移、`scripts/build-desktop.sh` 桌面打包。

## 第三方许可

许可及模型来源见 `licenses/`。仓库公开不代表第三方权重可无条件再分发；商业使用须遵守各模型条款。当前构建使用本机临时签名，未做 Apple 公证。

Built with Llama. Built with 面壁MiniCPM。

MiniCPM is licensed under the MiniCPM Model Community License, © OpenBMB Platforms, Inc. All rights reserved.

## 代码格式

JavaScript、HTML、CSS、JSON 使用 Prettier，缩进 2 个空格、建议每行不超过 100 字符；Python 使用 Black，Swift 使用 Apple `swift-format`，缩进 4 个空格。`.editorconfig` 为编辑器提供统一的换行和缩进规则。格式化不处理模型、依赖、构建产物或第三方许可文本。

```sh
npm run format
npm run format:check
npm run format:swift
npm run format:swift:check

# Python 格式化工具仅用于开发
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
npm run format:python
npm run format:python:check
```

提交前运行格式检查与 `npm test`。源码导出包会包含上述格式配置与开发依赖清单。
