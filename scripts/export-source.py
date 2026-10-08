#!/usr/bin/env python3
"""Create a source-only archive from an explicit allowlist, independent of Git state."""
import pathlib
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
files = [
    p
    for p in root.iterdir()
    if p.is_file()
    and (
        p.suffix in [".mjs", ".md", ".command"]
        or p.name
        in [
            "package.json",
            "package-lock.json",
            ".gitignore",
            ".editorconfig",
            ".prettierrc.json",
            ".prettierignore",
            ".swift-format",
            "pyproject.toml",
            "requirements-dev.txt",
        ]
    )
]
for folder in ["public", "desktop", "scripts", "licenses", "tests", ".github"]:
    for p in (root / folder).rglob("*"):
        if (
            p.is_file()
            and (
                folder == "licenses"
                or p.suffix
                in [
                    ".mjs",
                    ".js",
                    ".css",
                    ".html",
                    ".swift",
                    ".plist",
                    ".py",
                    ".sh",
                    ".md",
                    ".txt",
                    ".sb",
                    ".png",
                    ".yml",
                ]
            )
            and "__pycache__" not in p.parts
        ):
            files.append(p)
files += [
    root / "models/catalog.json",
    root / "translation-models/manifest.json",
    root / "runtime/README.md",
]
output = root / "release/local-lens-source.zip"
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as z:
    for p in sorted(set(files)):
        if p.stat().st_size > 10 * 1024 * 1024:
            raise RuntimeError("Unexpected large source file: " + str(p))
        z.write(p, "local-lens/" + str(p.relative_to(root)))
print(output, output.stat().st_size, "bytes")
