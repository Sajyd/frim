FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip ffmpeg libgl1 libglib2.0-0 ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# RTMW3D-x: 133-keypoint 3D whole body (body + hands + feet). MotionBERT is fallback.
RUN mkdir -p /models && \
    curl -L --fail -o /models/rtmw3d-x.onnx \
      https://huggingface.co/Soykaf/RTMW3D-x/resolve/main/onnx/rtmw3d-x_8xb64_cocktail14-384x288-b0a0eab7_20240626.onnx && \
    curl -L --fail -o /models/motionbert_3d_81.onnx \
      https://huggingface.co/bukuroo/MotionBERT-3d-ONNX/resolve/main/motionbert_3d_81.onnx
ENV RTMW3D_ONNX=/models/rtmw3d-x.onnx
ENV MOTIONBERT_ONNX=/models/motionbert_3d_81.onnx

COPY infer.py worker.py ./

ENV PYTHONUNBUFFERED=1
CMD ["python3", "worker.py"]
