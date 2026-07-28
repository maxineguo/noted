export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return // skip in `vite dev` — avoids fighting Vite's own HMR caching
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker registration failed', e))
  })
}

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}
