#!/usr/bin/env python3
"""Explicit, resumable model installation. No model downloads at app startup."""
import argparse
import hashlib
import json
import os
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT = pathlib.Path(
    os.environ.get(
        "LOCAL_LENS_DATA_DIR", pathlib.Path.home() / "Library/Application Support/Local Lens"
    )
)


def catalog():
    return json.loads((ROOT / "models/catalog.json").read_text())["models"]


def files(model):
    base = model.get("source", "").replace("/tree/", "/resolve/")
    for key, size, sha in [
        ("file", "size", "sha256"),
        ("projector", "projectorSize", "projectorSha256"),
    ]:
        if key not in model:
            continue
        remote = model.get(key + "Remote", model[key])
        url = base + "/" + remote if base.startswith("https://huggingface.co/") else None
        yield {
            "file": "models/" + model[key],
            "size": model[size],
            "sha256": model[sha],
            "source": url,
        }


def verified(path, entry):
    if not path.is_file() or path.stat().st_size != entry["size"]:
        return False
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest() == entry["sha256"]


def install(entry, dest, local_only=False):
    target = dest / entry["file"]
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if verified(target, entry):
            print("已校验", entry["file"], flush=True)
            return
        raise RuntimeError(f"{target} 已存在但校验失败，请先将它移到其他位置再重试。")
    part = target.with_name(target.name + ".part")
    local = ROOT / entry["file"]
    if local.is_file():
        if not verified(local, entry):
            raise RuntimeError("本地源文件校验失败：" + str(local))
        subprocess.run(["cp", "-c", str(local), str(part)], check=True)
    elif local_only:
        return
    else:
        url = entry.get("source")
        if not url:
            raise RuntimeError("此模型只提供已有文件导入，没有可验证下载地址：" + entry["file"])
        print("下载", entry["file"], flush=True)
        subprocess.run(
            [
                "curl",
                "-fL",
                "--retry",
                "4",
                "--connect-timeout",
                "30",
                "-C",
                "-",
                "--progress-bar",
                url,
                "-o",
                str(part),
            ],
            check=True,
        )
    if not verified(part, entry):
        raise RuntimeError("下载/复制校验失败：" + str(part))
    part.replace(target)
    print("已安装", entry["file"], flush=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("action", choices=["list", "install", "migrate", "verify"])
    p.add_argument("names", nargs="*")
    p.add_argument("--data-dir", type=pathlib.Path, default=DEFAULT)
    a = p.parse_args()
    models = catalog()
    known = {m["name"]: list(files(m)) for m in models}
    known["translation"] = json.loads((ROOT / "translation-models/manifest.json").read_text())
    if a.action == "list":
        for name, entries in known.items():
            print(
                name,
                round(sum(e["size"] for e in entries) / 1e9, 2),
                "GB",
                "(需导入已有文件)" if any(not e.get("source") for e in entries) else "",
            )
        return
    names = a.names or (
        list(known) if a.action in ["migrate", "verify"] else ["qwen3-vl:4b", "translation"]
    )
    if any(n not in known for n in names):
        p.error("未知模型名称；先运行 list 查看可选项。")
    for name in names:
        for entry in known[name]:
            if a.action == "verify":
                if not verified(a.data_dir / entry["file"], entry):
                    raise RuntimeError("缺失或校验失败：" + entry["file"])
            else:
                install(entry, a.data_dir, local_only=a.action == "migrate")
    if a.action == "migrate":
        registry = a.data_dir / "imported-models.json"
        if registry.exists():
            records = json.loads(registry.read_text())
            changed = False
            known_files = {
                e["file"].split("/")[-1]: e
                for entries in known.values()
                for e in entries
                if e["file"].startswith("models/")
            }
            for record in records:
                for key in ["file", "projector"]:
                    old = record.get(key, "")
                    entry = known_files.get(pathlib.Path(old).name)
                    if (
                        entry
                        and "/Contents/Resources/models/" in old
                        and verified(a.data_dir / entry["file"], entry)
                    ):
                        record[key] = str(a.data_dir / entry["file"])
                        changed = True
            if changed:
                temp = registry.with_suffix(".json.tmp")
                temp.write_text(json.dumps(records, indent=2))
                temp.replace(registry)
    print("模型目录：", a.data_dir)


if __name__ == "__main__":
    main()
