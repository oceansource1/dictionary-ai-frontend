# Local inference runtime

Binary assets are excluded from Git. On an Apple Silicon Mac run:

```sh
python3 scripts/setup-runtime.py
```

The script downloads llama.cpp b11435 from its official GitHub release and verifies the pinned SHA-256 before unpacking. The desktop build bundles this engine; model weights are installed separately. See `licenses/llama.cpp-LICENSE`.
