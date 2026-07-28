// Thin wrappers around the native Web Speech API — no server, no cost, works offline once
// the page is loaded. Support varies by browser (best in Chrome/Edge); callers should feature
// detect with isTTSSupported / isSTTSupported and degrade gracefully.

export function isTTSSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}
export function isSTTSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

function wordCount(s) {
  return (String(s || '').match(/\S+/g) || []).length
}

export function computeLectureTiming(chapters, wpm = 165) {
  const list = chapters || []
  const durations = list.map((c) => Math.max(5, (wordCount(c.script) / wpm) * 60))
  const offsets = []
  let acc = 0
  for (const d of durations) {
    offsets.push(acc)
    acc += d
  }
  return { durations, offsets, total: acc || 1 }
}

// Drives a multi-chapter narration: estimates per-chapter duration from word count (so the
// progress bar / "video" feel is smooth), and lets the actual speechSynthesis onend events
// (the source of truth) advance chapters.
export class LecturePlayer {
  constructor({ chapters, wpm = 165 }) {
    this.chapters = chapters || []
    this.wpm = wpm
    const timing = computeLectureTiming(this.chapters, wpm)
    this.durations = timing.durations
    this.offsets = timing.offsets
    this.total = timing.total
    this.chapterIndex = 0
    this.elapsedInChapter = 0
    this.isPlaying = false
    this._listeners = { progress: [], chapterchange: [], end: [], statechange: [], loading: [] }
    this._timer = null
    this._tickStart = 0
    this._started = false
  }

  on(evt, fn) {
    this._listeners[evt]?.push(fn)
    return () => {
      this._listeners[evt] = this._listeners[evt].filter((f) => f !== fn)
    }
  }
  _emit(evt, payload) {
    this._listeners[evt]?.forEach((f) => f(payload))
  }

  get totalElapsed() {
    return (this.offsets[this.chapterIndex] || 0) + this.elapsedInChapter
  }

  _speakChapter() {
    if (!isTTSSupported()) return
    window.speechSynthesis.cancel()
    const chapter = this.chapters[this.chapterIndex]
    if (!chapter) return
    const utter = new SpeechSynthesisUtterance(chapter.script)
    utter.rate = this._rate || 1.0
    utter.pitch = 1.0
    this._currentUtterance = utter
    const myChapter = this.chapterIndex
    utter.onend = () => {
      if (myChapter !== this.chapterIndex) return // superseded by a seek/restart
      this._stopTicking()
      this._advance()
    }
    utter.onerror = () => {
      if (myChapter !== this.chapterIndex) return
      this._stopTicking()
    }
    this._started = true
    window.speechSynthesis.speak(utter)
    this._startTicking()
  }

  _advance() {
    if (this.chapterIndex < this.chapters.length - 1) {
      this.chapterIndex += 1
      this.elapsedInChapter = 0
      this._emit('chapterchange', this.chapterIndex)
      this._speakChapter()
    } else {
      this.isPlaying = false
      this.elapsedInChapter = this.durations[this.chapterIndex] || 0
      this._emit('progress', this.totalElapsed)
      this._emit('end')
      this._emit('statechange', false)
    }
  }

  _startTicking() {
    this._stopTicking()
    this._tickStart = performance.now() - (this.elapsedInChapter * 1000) / (this._rate || 1)
    this._timer = setInterval(() => {
      const dur = this.durations[this.chapterIndex] || 1
      this.elapsedInChapter = Math.min(((performance.now() - this._tickStart) / 1000) * (this._rate || 1), dur)
      this._emit('progress', this.totalElapsed)
    }, 200)
  }
  _stopTicking() {
    if (this._timer) clearInterval(this._timer)
    this._timer = null
  }

  play() {
    if (!isTTSSupported()) return
    if (this._started && window.speechSynthesis.paused) {
      window.speechSynthesis.resume()
    } else if (!window.speechSynthesis.speaking) {
      this._speakChapter()
    }
    this._startTicking()
    this.isPlaying = true
    this._emit('statechange', true)
  }

  pause() {
    if (!isTTSSupported()) return
    window.speechSynthesis.pause()
    this._stopTicking()
    this.isPlaying = false
    this._emit('statechange', false)
  }

  restartChapter(index) {
    if (!isTTSSupported()) return
    window.speechSynthesis.cancel()
    this._stopTicking()
    this.chapterIndex = Math.max(0, Math.min(index, this.chapters.length - 1))
    this.elapsedInChapter = 0
    this._emit('chapterchange', this.chapterIndex)
    this._emit('progress', this.totalElapsed)
    this._speakChapter()
    this.isPlaying = true
    this._emit('statechange', true)
  }

  // SpeechSynthesis has no true seek API, so scrubbing/skipping in the fallback player jumps
  // to the nearest chapter boundary rather than an exact mid-chapter position.
  seekRatio(ratio) {
    const target = Math.max(0, Math.min(1, ratio)) * this.total
    let idx = 0
    for (let i = 0; i < this.chapters.length; i++) if (target >= this.offsets[i]) idx = i
    this.restartChapter(idx)
  }
  skip(deltaSeconds) {
    this.seekRatio(this.totalElapsed / this.total + deltaSeconds / this.total)
  }
  setRate(rate) {
    this._rate = rate
    if (this._currentUtterance) this._currentUtterance.rate = rate
    if (window.speechSynthesis?.speaking) this.restartChapter(this.chapterIndex)
  }

  destroy() {
    if (isTTSSupported()) window.speechSynthesis.cancel()
    this._stopTicking()
  }
}

// Live speech-to-text for Teach mode. Fires onResult({ finalText, interimText }) continuously.
export function createRecognizer({ onResult, onEnd, onError } = {}) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
  if (!SR) return null
  const rec = new SR()
  rec.continuous = true
  rec.interimResults = true
  rec.lang = 'en-US'
  let finalText = ''
  rec.onresult = (e) => {
    let interimText = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript
      if (e.results[i].isFinal) finalText += `${t} `
      else interimText += t
    }
    onResult?.({ finalText, interimText })
  }
  rec.onend = () => onEnd?.()
  rec.onerror = (e) => onError?.(e)
  rec.getFinalText = () => finalText
  rec.resetFinalText = () => {
    finalText = ''
  }
  return rec
}
