#!/usr/bin/env python3
import hashlib
import pathlib
import platform
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSION = "b11435"
SHA = "65f564a94c328dee846a395796d060671fb64f4334a84857c222b2416f039545"
URL = f"https://github.com/ggml-org/llama.cpp/releases/download/{VERSION}/llama-{VERSION}-bin-macos-arm64.tar.gz"
if platform.system() != "Darwin" or platform.machine() != "arm64":
    raise SystemExit("当前桌面构建只支持 Apple Silicon macOS。")
dest = ROOT / "runtime" / ("llama-" + VERSION)
if (dest / "llama-server").exists():
    print("推理引擎已存在：", dest)
    raise SystemExit(0)
with tempfile.TemporaryDirectory(prefix="local-lens-runtime-") as temp:
    temp = pathlib.Path(temp)
    archive = temp / "runtime.tar.gz"
    subprocess.run(["curl", "-fL", "--retry", "3", URL, "-o", str(archive)], check=True)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA:
        raise RuntimeError("引擎 SHA-256 校验失败")
    subprocess.run(["tar", "-xzf", str(archive), "-C", str(temp)], check=True)
    executable = next(p for p in temp.rglob("llama-server") if p.is_file())
    if dest.exists():
        raise RuntimeError("目标目录已存在但不完整，请先移开再运行：" + str(dest))
    shutil.copytree(executable.parent, dest, symlinks=True)
    print("推理引擎安装完成：", dest)
