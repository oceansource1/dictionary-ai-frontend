# Bundled components

- llama.cpp b11435: https://github.com/ggml-org/llama.cpp/releases/tag/b11435 (MIT, see llama.cpp-LICENSE).
- Qwen3-VL-4B-Instruct Q4_K_M and F16 vision projector: https://huggingface.co/unsloth/Qwen3-VL-4B-Instruct-GGUF/tree/00c00da0690c4b14b5539b02c4ea5d7c9102b35e (Apache-2.0). Original model: https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct .
- DeepSeek-R1-Distill-Llama-8B Q4_K_M: pre-existing local GGUF, copied independently. MIT license in DeepSeek-R1-LICENSE; underlying Llama 3.1 terms also apply, see Llama-3.1-LICENSE and Llama-3.1-USE-POLICY. Built with Llama.
- Node.js: locally installed v22.22.1 runtime, MIT and bundled third-party notices in Node-LICENSE.

Pinned model sizes and SHA-256 values are in models/catalog.json.

- Sentence translation: Xenova/opus-mt-en-zh (revision 046f55aec303cdee3e0318604406d4df20f1e8ea) and Xenova/opus-mt-zh-en (revision 39d480d52a9ea3065a1f117adfe4dbc55de10e6f), ONNX conversions by Xenova of Helsinki-NLP/OPUS-MT Marian encoder-decoder translation models. English→Chinese: Apache-2.0. Chinese→English: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); attribution to Helsinki-NLP Research Group and Xenova. These are quantized ONNX conversions of the originals; see CC-BY-4.0.txt. Sources: https://huggingface.co/Xenova/opus-mt-en-zh and https://huggingface.co/Xenova/opus-mt-zh-en .
- @huggingface/transformers 4.3.0 (Apache-2.0), ONNX Runtime and supporting packages: license files preserved in their bundled node_modules package directories. Dependencies pinned in package-lock.json.

## Added vision models (v2.4)
- MiniCPM-V-4.5 Q4_K_M + F16 mmproj: https://huggingface.co/openbmb/MiniCPM-V-4_5-gguf/tree/8bfaecb5b1a65f068b86c32b997a3d5d8902eb36 . The model card references the MiniCPM model license; the referenced file was subsequently removed from the upstream main branch. Its historical text is retained in MiniCPM-Model-License.md from commit 51f3f36614efda7eca8f402b58ee6e70ec358dc5. Current upstream code Apache license is separately retained in MiniCPM-Code-LICENSE.txt.
- Qwen3.5-9B Q4_K_M + F16 mmproj: https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/tree/3885219b6810b007914f3a7950a8d1b469d598a5 . Original model: https://huggingface.co/Qwen/Qwen3.5-9B . Apache 2.0 text: Qwen3.5-LICENSE.
- Exact sizes and SHA-256 checksums: models/catalog.json. Reproducible resumable downloads: scripts/download-vision-models.py.

Built with 面壁MiniCPM

MiniCPM is licensed under the MiniCPM Model Community License, © OpenBMB Platforms, Inc. All rights reserved.

- Downloadable DeepSeek-R1-Distill-Llama-8B Q4_K_M: https://huggingface.co/bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF/tree/935d400c2ed1a29cc2a1045df25ec7998fb4dfe4 . Pinned separately from the pre-existing local 8B file. Original DeepSeek and underlying Llama 3.1 license texts are retained above.
