#!/usr/bin/env python3
"""SQS GPU mocap worker. One job at a time (one GPU per concurrent user).

Writes landmarks JSON to S3, then stays warm so the next user can reuse this
instance. After IDLE_SECONDS (default 5 minutes) with an empty queue it TERMINATES
so the EBS volume is deleted — no per-user disk bill.
"""
from __future__ import annotations

import json
import os
import signal
import sys
import tempfile
import time
import traceback
from datetime import datetime, timezone
from urllib.request import Request, urlopen

import boto3

from infer import infer_video, maybe_transcode

REGION = os.environ.get('AWS_REGION') or os.environ.get('AWS_DEFAULT_REGION') or 'us-east-1'
BUCKET = os.environ['GPU_S3_BUCKET']
QUEUE_URL = os.environ['GPU_SQS_QUEUE_URL']
SECRET = os.environ.get('GPU_WORKER_SECRET', '')
CALLBACK_URL = os.environ.get('GPU_CALLBACK_URL', '').rstrip('/')
IDLE_SECONDS = int(os.environ.get('IDLE_SECONDS', '300'))
MIN_UPTIME = int(os.environ.get('MIN_UPTIME_SECONDS', '90'))
SPOT_HOUR_USD = float(os.environ.get('GPU_SPOT_USD_PER_HOUR', '0.13'))

sqs = boto3.client('sqs', region_name=REGION)
s3 = boto3.client('s3', region_name=REGION)
cw = boto3.client('cloudwatch', region_name=REGION)
ec2 = boto3.client('ec2', region_name=REGION)

STARTED = time.time()
LAST_JOB = time.time()
RUNNING = True


def log(msg: str) -> None:
    print(msg, flush=True)


def put_metric(name: str, value: float, unit: str = 'Count') -> None:
    try:
        cw.put_metric_data(
            Namespace='Frim/GpuMocap',
            MetricData=[{
                'MetricName': name,
                'Value': value,
                'Unit': unit,
                'Timestamp': datetime.now(timezone.utc),
            }],
        )
    except Exception as exc:
        log(f'metric failed: {exc}')


def instance_id() -> str:
    try:
        token_req = Request(
            'http://169.254.169.254/latest/api/token',
            method='PUT',
            headers={'X-aws-ec2-metadata-token-ttl-seconds': '21600'},
        )
        token = urlopen(token_req, timeout=2).read().decode()
        req = Request(
            'http://169.254.169.254/latest/meta-data/instance-id',
            headers={'X-aws-ec2-metadata-token': token},
        )
        with urlopen(req, timeout=2) as resp:
            return resp.read().decode().strip()
    except Exception:
        try:
            req = Request('http://169.254.169.254/latest/meta-data/instance-id', method='GET')
            with urlopen(req, timeout=2) as resp:
                return resp.read().decode().strip()
        except Exception:
            return os.environ.get('HOSTNAME', 'unknown')


def callback(job_id: str, payload: dict) -> None:
    if not CALLBACK_URL or not SECRET:
        return
    body = json.dumps({**payload, 'jobId': job_id, 'secret': SECRET}).encode()
    req = Request(
        f'{CALLBACK_URL}/api/capture/gpu/{job_id}/complete',
        data=body,
        headers={'Content-Type': 'application/json', 'x-gpu-worker-secret': SECRET},
        method='POST',
    )
    try:
        with urlopen(req, timeout=20) as resp:
            log(f'callback {job_id}: {resp.status}')
    except Exception as exc:
        log(f'callback failed: {exc}')


def process_message(body: dict) -> None:
    job_id = body['jobId']
    input_key = body['inputKey']
    result_key = body.get('resultKey') or f'results/{job_id}.json'
    log(f'job {job_id} ← s3://{BUCKET}/{input_key}')
    callback(job_id, {'status': 'running', 'progress': 5, 'instanceId': instance_id()})

    tmp_in = tempfile.NamedTemporaryFile(suffix=os.path.splitext(input_key)[1] or '.mp4', delete=False)
    tmp_in.close()
    s3.download_file(BUCKET, input_key, tmp_in.name)
    video_path = maybe_transcode(tmp_in.name)

    last_pct = [-1]

    def on_progress(done: int, total: int) -> None:
        pct = 10 + int(80 * done / max(total, 1))
        if pct >= last_pct[0] + 10 or done >= total:
            last_pct[0] = pct
            callback(job_id, {'status': 'running', 'progress': pct, 'instanceId': instance_id()})

    t0 = time.time()
    result = infer_video(video_path, progress_cb=on_progress)
    duration_ms = int((time.time() - t0) * 1000)
    billed = (time.time() - t0) / 3600.0 * SPOT_HOUR_USD
    result['jobId'] = job_id
    result['durationMs'] = duration_ms

    out = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
    out.write(json.dumps(result).encode())
    out.close()
    s3.upload_file(out.name, BUCKET, result_key, ExtraArgs={'ContentType': 'application/json'})

    put_metric('JobsCompleted', 1)
    put_metric('JobDurationSeconds', duration_ms / 1000.0, 'Seconds')
    put_metric('EstimatedJobUsd', billed, 'None')

    callback(job_id, {
        'status': 'complete',
        'progress': 100,
        'resultKey': result_key,
        'durationMs': duration_ms,
        'instanceId': instance_id(),
        'billedUsd': round(billed, 5),
    })
    log(f'job {job_id} done in {duration_ms}ms')

    for path in {tmp_in.name, video_path, out.name}:
        try:
            os.unlink(path)
        except OSError:
            pass


def terminate_instance() -> None:
    iid = instance_id()
    log(f'queue idle for {IDLE_SECONDS}s — terminating {iid} (delete disk)')
    put_metric('IdleTerminate', 1)
    try:
        ec2.terminate_instances(InstanceIds=[iid])
    except Exception as exc:
        log(f'terminate API failed ({exc}); falling back to shutdown')
        os.system('sudo shutdown -h now || shutdown -h now')
    sys.exit(0)


def handle_term(*_args) -> None:
    global RUNNING
    RUNNING = False


def main() -> None:
    signal.signal(signal.SIGTERM, handle_term)
    signal.signal(signal.SIGINT, handle_term)
    iid = instance_id()
    log(f'gpu worker up on {iid} idle={IDLE_SECONDS}s')
    put_metric('WorkerStart', 1)
    # Warm the pose model so the first job is not a 30s download.
    try:
        from infer import get_body, get_motionbert
        get_body()
        get_motionbert()
        log('pose + MotionBERT ready')
    except Exception as exc:
        log(f'model warmup failed (will retry on job): {exc}')

    while RUNNING:
        resp = sqs.receive_message(
            QueueUrl=QUEUE_URL,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=20,
            VisibilityTimeout=900,
        )
        messages = resp.get('Messages') or []
        if messages:
            global LAST_JOB
            LAST_JOB = time.time()
            msg = messages[0]
            try:
                body = json.loads(msg['Body'])
                process_message(body)
            except Exception as exc:
                log(f'job failed: {exc}\n{traceback.format_exc()}')
                put_metric('JobsFailed', 1)
                try:
                    job_id = json.loads(msg['Body']).get('jobId')
                except Exception:
                    job_id = None
                if job_id:
                    callback(job_id, {
                        'status': 'failed',
                        'error': str(exc)[:500],
                        'instanceId': iid,
                    })
            finally:
                try:
                    sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=msg['ReceiptHandle'])
                except Exception as exc:
                    log(f'delete message failed: {exc}')
            continue

        idle_for = time.time() - LAST_JOB
        uptime = time.time() - STARTED
        if idle_for >= IDLE_SECONDS and uptime >= MIN_UPTIME:
            terminate_instance()

    log('worker exiting without shutdown')


if __name__ == '__main__':
    main()
