// Embeds YouTube's own player (via their official IFrame API) to play a well-known public lofi
// livestream for the "Lofi" focus-timer option — real music instead of synthesized chords.
// This is genuinely embedding, not redistributing: YouTube's embed feature exists exactly for
// this. It needs an internet connection (unlike the other, fully-offline ambient presets), and
// falls back automatically to the synthesized version if the API or video ever fails to load.

// Lofi Girl's official "lofi hip hop radio - beats to relax/study to" livestream, current as of
// writing. If this ever goes stale, swap in any other public YouTube video/livestream ID here.
export const LOFI_VIDEO_ID = 'X4VbdwhkE10'

let apiLoadPromise = null
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve()
  if (apiLoadPromise) return apiLoadPromise
  apiLoadPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('YouTube API timed out')), 8000)
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout)
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('Could not load the YouTube player'))
    }
    document.head.appendChild(script)
  })
  return apiLoadPromise
}

let playerInstance = null
let containerEl = null

function ensureContainer() {
  if (containerEl) return containerEl
  containerEl = document.createElement('div')
  containerEl.id = 'noted-lofi-yt-player'
  // Visually hidden but still rendered (YouTube's player needs to exist in the DOM to play).
  containerEl.style.cssText = 'position:fixed;bottom:0;right:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;'
  document.body.appendChild(containerEl)
  return containerEl
}

// Resolves once the stream is actually playing, or rejects (caller should fall back).
export async function playLofiStream(volume = 0.5) {
  await loadYouTubeApi()
  const container = ensureContainer()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Lofi stream timed out')), 10000)
    if (playerInstance) {
      try {
        playerInstance.seekTo(0, true)
        playerInstance.setVolume(Math.round(volume * 100))
        playerInstance.playVideo()
        clearTimeout(timeout)
        resolve()
        return
      } catch {
        /* fall through to recreate */
      }
    }
    playerInstance = new window.YT.Player(container, {
      videoId: LOFI_VIDEO_ID,
      playerVars: { autoplay: 1, controls: 0, disablekb: 1 },
      events: {
        onReady: (e) => {
          e.target.setVolume(Math.round(volume * 100))
          e.target.playVideo()
          clearTimeout(timeout)
          resolve()
        },
        onError: () => {
          clearTimeout(timeout)
          reject(new Error('Lofi stream unavailable'))
        },
      },
    })
  })
}

export function stopLofiStream() {
  try {
    playerInstance?.pauseVideo?.()
  } catch {
    /* ignore */
  }
}

export function setLofiVolume(volume) {
  try {
    playerInstance?.setVolume?.(Math.round(volume * 100))
  } catch {
    /* ignore */
  }
}
