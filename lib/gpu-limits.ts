/** Client-safe GPU capture limits (no Prisma / AWS). */

export const GPU_JOB_TIMEOUT_MS = 40 * 60 * 1000
export const GPU_MAX_UPLOAD_BYTES = 80 * 1024 * 1024
/** Studio GPU video capture max length (Spot cost / interruption budget). */
export const GPU_MAX_DURATION_SEC = 60
export const GPU_MIN_DURATION_SEC = 1
