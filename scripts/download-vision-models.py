#!/usr/bin/env python3
"""Compatibility entry point; installs in the independent user model directory."""
import pathlib
import subprocess
import sys

subprocess.run(
    [
        sys.executable,
        str(pathlib.Path(__file__).with_name("models.py")),
        "install",
        "minicpm-v:4.5",
        "qwen3.5:9b",
    ],
    check=True,
)
