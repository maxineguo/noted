// Every Gemini call in the app funnels through here. Free-tier keys are typically limited to
// ~10-15 requests/minute, and a single "Generate study materials" click can fire off several
// calls in a row (main generation, then illustrations) — without spacing them out, later calls
// silently fail with 429s. This keeps a minimum gap between every call, project-wide.
const MIN_INTERVAL_MS = 6500

let queue = Promise.resolve()
let lastCallAt = 0

export function throttledCall(fn) {
  const run = async () => {
    const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - Date.now())
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastCallAt = Date.now()
    return fn()
  }
  const result = queue.then(run, run)
  // Keep the chain alive even if this particular call fails — callers still see their own
  // rejection via `result`, but one failure shouldn't block everything queued after it.
  queue = result.then(
    () => {},
    () => {},
  )
  return result
}
