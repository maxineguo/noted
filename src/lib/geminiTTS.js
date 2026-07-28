import { GoogleGenAI } from '@google/genai'
import { computeLectureTiming } from './speech'
import { throttledCall } from './apiThrottle'
import { VOICE_NAME } from './gemini'

export const TTS_MODEL = 'gemini-2.5-flash-preview-tts'

function pcmToWavBlob(base64Pcm, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const binary = atob(base64Pcm)
  const len = binary.length
  const pcmBytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) pcmBytes[i] = binary.charCodeAt(i)

  const blockAlign = (numChannels * bitsPerSample) / 8
  const byteRate = sampleRate * blockAlign
  const buffer = new ArrayBuffer(44 + len)
  const view = new DataView(buffer)
  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + len, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(36, 'data')
  view.setUint32(40, len, true)
  new Uint8Array(buffer, 44).set(pcmBytes)
  return new Blob([buffer], { type: 'audio/wav' })
}

async function generateChapterAudioUrl({ apiKey, text, voiceName = VOICE_NAME }) {
  const ai = new GoogleGenAI({ apiKey })
  const response = await throttledCall(() =>
    ai.models.generateContent({
      model: TTS_MODEL,
      contents: text,
      config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
    }),
  )
  const parts = response.candidates?.[0]?.content?.parts || []
  const audioPart = parts.find((p) => p.inlineData)
  if (!audioPart) throw new Error('No audio returned')
  const mimeType = audioPart.inlineData.mimeType || 'audio/L16;rate=24000'
  const rateMatch = mimeType.match(/rate=(\d+)/)
  const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000
  const blob = pcmToWavBlob(audioPart.inlineData.data, sampleRate)
  return URL.createObjectURL(blob)
}

// Real <audio>-element player, one WAV per chapter, generated lazily via Gemini TTS and
// cached in memory for the session (never written to localStorage — audio is too large for
// that budget, so it's simply regenerated next time the notebook is opened).
export class AudioLecturePlayer {
  constructor({ chapters, apiKey, onError }) {
    this.chapters = chapters || []
    this.apiKey = apiKey
    this.onError = onError
    this.audio = typeof Audio !== 'undefined' ? new Audio() : null
    this.chapterIndex = 0
    this.cache = new Map()
    this.durations = computeLectureTiming(this.chapters).durations.slice() // estimates, replaced with real values as chapters load
    this.offsets = computeLectureTiming(this.chapters).offsets.slice()
    this.rate = 1
    this.isPlaying = false
    this._listeners = { progress: [], chapterchange: [], end: [], statechange: [], loading: [] }
    this._destroyed = false

    if (this.audio) {
      this.audio.addEventListener('timeupdate', () => this._emit('progress', this.totalElapsed))
      this.audio.addEventListener('ended', () => this._advance())
      this.audio.addEventListener('play', () => {
        this.isPlaying = true
        this._emit('statechange', true)
      })
      this.audio.addEventListener('pause', () => {
        this.isPlaying = false
        this._emit('statechange', false)
      })
      this.audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(this.audio.duration)) this._recomputeOffsets(this.chapterIndex, this.audio.duration)
      })
    }
  }

  on(evt, fn) {
    this._listeners[evt]?.push(fn)
    return () => {
      this._listeners[evt] = this._listeners[evt].filter((f) => f !== fn)
    }
  }
  _emit(evt, payload) {
    if (this._destroyed) return
    this._listeners[evt]?.forEach((f) => f(payload))
  }

  _recomputeOffsets(index, realDuration) {
    this.durations[index] = realDuration
    let acc = 0
    for (let i = 0; i < this.durations.length; i++) {
      this.offsets[i] = acc
      acc += this.durations[i]
    }
    this.total = acc || 1
  }

  get total() {
    return this.__total || this.durations.reduce((a, b) => a + b, 0) || 1
  }
  set total(v) {
    this.__total = v
  }
  get totalElapsed() {
    return (this.offsets[this.chapterIndex] || 0) + (this.audio?.currentTime || 0)
  }

  async _load(index) {
    if (this.cache.has(index)) return this.cache.get(index)
    const promise = generateChapterAudioUrl({ apiKey: this.apiKey, text: this.chapters[index].script }).catch((e) => {
      this.cache.delete(index)
      throw e
    })
    this.cache.set(index, promise)
    return promise
  }

  async _activate(index, seekTo = 0) {
    this._emit('loading', true)
    try {
      const url = await this._load(index)
      if (this._destroyed) return false
      if (this.audio.src !== url) {
        this.audio.src = url
        this.audio.playbackRate = this.rate
      }
      if (seekTo > 0) this.audio.currentTime = seekTo
      await this.audio.play()
      const next = index + 1
      if (next < this.chapters.length) this._load(next).catch(() => {})
      return true
    } catch (e) {
      this.onError?.(e)
      return false
    } finally {
      this._emit('loading', false)
    }
  }

  async play() {
    if (!this.audio) return false
    if (this.audio.src && !this.audio.ended) {
      await this.audio.play()
      return true
    }
    return this._activate(this.chapterIndex)
  }

  pause() {
    this.audio?.pause()
  }

  async _advance() {
    if (this.chapterIndex < this.chapters.length - 1) {
      this.chapterIndex += 1
      this._emit('chapterchange', this.chapterIndex)
      await this._activate(this.chapterIndex)
    } else {
      this.isPlaying = false
      this._emit('progress', this.totalElapsed)
      this._emit('end')
      this._emit('statechange', false)
    }
  }

  async restartChapter(index) {
    this.chapterIndex = Math.max(0, Math.min(index, this.chapters.length - 1))
    this._emit('chapterchange', this.chapterIndex)
    await this._activate(this.chapterIndex)
  }

  seekRatio(ratio) {
    const target = Math.max(0, Math.min(1, ratio)) * this.total
    let idx = 0
    for (let i = 0; i < this.chapters.length; i++) if (target >= this.offsets[i]) idx = i
    const within = Math.max(0, target - this.offsets[idx])
    if (idx === this.chapterIndex && this.audio?.src) {
      this.audio.currentTime = Math.min(within, this.audio.duration || within)
    } else {
      this._activate(idx, within)
      this.chapterIndex = idx
      this._emit('chapterchange', idx)
    }
  }

  skip(deltaSeconds) {
    if (!this.audio) return
    const newTime = (this.audio.currentTime || 0) + deltaSeconds
    if (newTime < 0) {
      if (this.chapterIndex > 0) this.restartChapter(this.chapterIndex - 1)
      else this.audio.currentTime = 0
      return
    }
    if (this.audio.duration && newTime > this.audio.duration) {
      this._advance()
      return
    }
    this.audio.currentTime = newTime
  }

  setRate(rate) {
    this.rate = rate
    if (this.audio) this.audio.playbackRate = rate
  }

  destroy() {
    this._destroyed = true
    this.audio?.pause()
    this.cache.forEach((p) => p.then?.((url) => URL.revokeObjectURL(url)).catch(() => {}))
  }
}
