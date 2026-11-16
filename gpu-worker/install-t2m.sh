#!/bin/bash
# CUDA torch + Motius, for MotionLCM (ECCV 2024) text-to-motion.
# Idempotent: a later container start skips the download when imports succeed.
set -euo pipefail

if python3 -c "import torch, motius, transformers, sentencepiece, sentence_transformers" >/dev/null 2>&1; then
  python3 -c "import torch; print('motionlcm deps ready', torch.__version__)"
  exit 0
fi

pip3 install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cu124
printf 'torch==2.5.1\n' > /tmp/frim-torch-constraint.txt
pip3 install --no-cache-dir -c /tmp/frim-torch-constraint.txt \
  'numpy>=1.26.4,<2' \
  'transformers>=4.44,<4.48' \
  'sentencepiece>=0.2' \
  'protobuf>=4.25' \
  'huggingface_hub>=0.26' \
  'accelerate>=0.34' \
  'mmengine>=0.10' \
  'peft>=0.13' \
  'safetensors>=0.4' \
  'scipy>=1.11' \
  'datasets>=2.20' \
  'diffusers>=0.30' \
  'sentence-transformers>=3.0' \
  'motius @ git+https://github.com/ZeyuLing/Motius.git@9a4bc7d0b45c186664422f48868272c56c71554a'
python3 -c "import torch, motius; print('motionlcm deps installed', torch.__version__)"
