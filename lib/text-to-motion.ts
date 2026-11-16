/** Prompt helpers for MotionLCM text-to-motion. The clip itself is generated on the Spot T4. */

export const TEXT_MOTION_EXAMPLES = [
  'a person walks forward',
  'a person runs and waves',
  'a person jumps',
  'a person dances happily',
  'a person sits down',
  'a person walks slowly and sadly',
] as const

export const MOTION_FPS = 20

/** MotionLCM emits multiples of 4 frames at 20 fps (40–196). Default is 6 seconds. */
export function motionFrameCount(prompt: string) {
  const match = prompt.match(/(\d+(?:\.\d+)?)\s*(?:seconds|second|secs|sec|s)\b/i)
  let seconds = match ? Number(match[1]) : 6
  if (!Number.isFinite(seconds)) seconds = 6
  seconds = Math.min(9.8, Math.max(2, seconds))
  const raw = Math.round(seconds * MOTION_FPS)
  const frames = raw - (raw % 4)
  return Math.max(40, Math.min(196, frames))
}

export function motionClipName(prompt: string) {
  const clean = prompt.trim().replace(/\s+/g, ' ')
  const titled = clean.charAt(0).toUpperCase() + clean.slice(1)
  return titled.length > 48 ? `${titled.slice(0, 47)}…` : titled
}
