FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip ffmpeg libgl1 libglib2.0-0 ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt install-t2m.sh ./
RUN pip3 install --no-cache-dir -r requirements.txt \
    && bash install-t2m.sh \
    && python3 -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='ZeyuLing/Motius-MotionLCM-HumanML3D', local_dir='/models/motionlcm'); snapshot_download(repo_id='sentence-transformers/sentence-t5-large')" \
    && printf '9a4bc7d0b45c186664422f48868272c56c71554a\n' > /opt/motionlcm-rev
ENV MOTIONLCM_DIR=/models/motionlcm
ENV MOTIONLCM_REPO=ZeyuLing/Motius-MotionLCM-HumanML3D

# RTMW3D-x: 133-keypoint 3D whole body (body + hands + feet). MotionBERT is fallback.
# Kept as the Spot-T4 video mocap path (OnlineHMR/GVHMR/WHAM are too heavy for g4dn).
RUN mkdir -p /models && \
    curl -L --fail -o /models/rtmw3d-x.onnx \
      https://huggingface.co/Soykaf/RTMW3D-x/resolve/main/onnx/rtmw3d-x_8xb64_cocktail14-384x288-b0a0eab7_20240626.onnx && \
    curl -L --fail -o /models/motionbert_3d_81.onnx \
      https://huggingface.co/bukuroo/MotionBERT-3d-ONNX/resolve/main/motionbert_3d_81.onnx
ENV RTMW3D_ONNX=/models/rtmw3d-x.onnx
ENV MOTIONBERT_ONNX=/models/motionbert_3d_81.onnx

COPY infer.py worker.py robust.py t2m.py ./

ENV PYTHONUNBUFFERED=1
CMD ["python3", "worker.py"]
