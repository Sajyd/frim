#!/usr/bin/env bash
# Deploy GPU mocap infra. Uses the caller’s AWS_PROFILE locally.
# Does not create or print IAM access keys.
set -euo pipefail

REGION="${AWS_REGION:-eu-north-1}"
STACK="${STACK_NAME:-frim-gpu-mocap}"
BUDGET="${AWS_BUDGET_LIMIT:-80}"
MAX_INSTANCES="${GPU_MAX_INSTANCES:-100}"
CALLBACK="${GPU_CALLBACK_URL:?Set GPU_CALLBACK_URL e.g. https://frim.app}"
VERCEL_TEAM="${VERCEL_TEAM_SLUG:-sajyds-projects}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Deploying $STACK in $REGION (eu-north-1 budget cap \$$BUDGET/mo, max ${MAX_INSTANCES} GPUs, idle 900s)"
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file "$ROOT/infra/gpu-mocap.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    MonthlyBudgetUsd="$BUDGET" \
    CallbackUrl="$CALLBACK" \
    IdleSeconds=900 \
    MaxInstances="$MAX_INSTANCES" \
    VercelTeamSlug="$VERCEL_TEAM"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)"

echo "Uploading worker to s3://$BUCKET/worker/"
aws s3 sync "$ROOT/gpu-worker/" "s3://$BUCKET/worker/" --region "$REGION" \
  --exclude '*.pyc' --exclude '__pycache__/*'

# Drop the global Budgets API entry if a previous deploy created one.
if aws budgets describe-budget --account-id "$ACCOUNT" --budget-name frim-gpu-mocap-monthly --region us-east-1 >/dev/null 2>&1; then
  echo "Removing us-east-1 AWS Budgets entry (spend cap is tracked in eu-north-1)"
  aws budgets delete-budget --account-id "$ACCOUNT" --budget-name frim-gpu-mocap-monthly --region us-east-1 || true
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  REPO="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/frim-gpu-mocap"
  echo "Pushing GPU worker image to $REPO:latest"
  aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
  docker build -t "$REPO:latest" "$ROOT/gpu-worker"
  docker push "$REPO:latest"
else
  echo "Docker daemon not running — instances will build the worker from S3 on first boot."
fi

echo
echo "Vercel needs role ARN + resource names only (no access keys):"
aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='VercelEnv'].OutputValue" --output text
echo
echo "Enable Vercel OIDC (project Settings > Security) and set AWS_ROLE_ARN from AppRoleArn."
echo "No GPU is running. Idle workers terminate after 900s. eu-north-1 spend is capped at \$$BUDGET."
