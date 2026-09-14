#!/bin/bash
# Idempotent instance bootstrap. Image comes from ECR when available so a
# terminated instance can come back without a 10-minute docker build.
set -euxo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
BUCKET="${GPU_S3_BUCKET:?}"
QUEUE_URL="${GPU_SQS_QUEUE_URL:?}"
SECRET="${GPU_WORKER_SECRET:-}"
CALLBACK_URL="${GPU_CALLBACK_URL:-}"
IDLE_SECONDS="${IDLE_SECONDS:-300}"
SPOT_USD="${GPU_SPOT_USD_PER_HOUR:-0.13}"
ECR_IMAGE="${GPU_ECR_IMAGE:-}"

export AWS_DEFAULT_REGION="$REGION"

if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker.io
  systemctl enable --now docker
fi

if ! docker info 2>/dev/null | grep -q 'Runtimes:.*nvidia'; then
  if ! command -v nvidia-ctk >/dev/null 2>&1; then
    apt-get update
    apt-get install -y gnupg curl
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
      | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
      | tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    apt-get update
    apt-get install -y nvidia-container-toolkit
  fi
  nvidia-ctk runtime configure --runtime=docker || true
  systemctl restart docker
fi

IMAGE="frim-gpu-worker"
if [ -n "$ECR_IMAGE" ]; then
  aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ECR_IMAGE%%/*}"
  if docker pull "$ECR_IMAGE"; then
    IMAGE="$ECR_IMAGE"
  fi
fi

# Always refresh Python from S3 so infer.py deploys without a local docker push.
aws s3 sync "s3://${BUCKET}/worker/" /opt/frim-gpu-worker/ --region "$REGION"
MOUNT=""
PIP_CMD=""
if [ -f /opt/frim-gpu-worker/infer.py ]; then
  MOUNT="-v /opt/frim-gpu-worker/infer.py:/app/infer.py:ro -v /opt/frim-gpu-worker/worker.py:/app/worker.py:ro -v /opt/frim-gpu-worker/requirements.txt:/opt/frim-gpu-worker/requirements.txt:ro"
  PIP_CMD="pip3 install --no-cache-dir -r /opt/frim-gpu-worker/requirements.txt && "
fi

BUILT_LOCAL=0
if [ "$IMAGE" = "frim-gpu-worker" ]; then
  cd /opt/frim-gpu-worker
  docker build -t frim-gpu-worker .
  BUILT_LOCAL=1
  MOUNT=""
  PIP_CMD=""
fi

docker rm -f frim-gpu-worker 2>/dev/null || true
GPU_FLAGS="--gpus all"
if ! docker run --help | grep -q gpus; then GPU_FLAGS=""; fi
docker run -d --name frim-gpu-worker $GPU_FLAGS --restart unless-stopped \
  -e AWS_REGION="$REGION" \
  -e AWS_DEFAULT_REGION="$REGION" \
  -e GPU_S3_BUCKET="$BUCKET" \
  -e GPU_SQS_QUEUE_URL="$QUEUE_URL" \
  -e GPU_CALLBACK_URL="$CALLBACK_URL" \
  -e GPU_WORKER_SECRET="$SECRET" \
  -e IDLE_SECONDS="$IDLE_SECONDS" \
  -e GPU_SPOT_USD_PER_HOUR="$SPOT_USD" \
  $MOUNT \
  "$IMAGE" \
  bash -c "${PIP_CMD}exec python3 /app/worker.py"

# Cache a first-boot image in ECR so the next Spot GPU can pull instead of rebuild.
if [ "$BUILT_LOCAL" = "1" ] && [ -n "$ECR_IMAGE" ]; then
  (
    aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ECR_IMAGE%%/*}"
    docker tag frim-gpu-worker "$ECR_IMAGE"
    docker push "$ECR_IMAGE"
  ) >/var/log/frim-ecr-push.log 2>&1 &
fi
