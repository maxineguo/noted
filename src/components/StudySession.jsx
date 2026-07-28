import { useState, useEffect, useRef, useCallback } from 'react'
import { Timer, X, Minus, Play, Pause, RotateCcw, Music, Headphones, CloudRain, Wind, Trees, VolumeX, Volume2, Lock, Unlock } from 'lucide-react'
import { playAmbient, stopAmbient, setAmbientVolume, isAmbientSupported, playTimerFinishedChime } from '../lib/ambientSound'
import { playLofiStream, stopLofiStream, setLofiVolume } from '../lib/youtubeLofi'

const PRESETS = [15, 30, 45, 60]
const MUSIC_OPTIONS = [
  { id: 'lofi', label: 'Lofi', icon: Headphones },
  { id: 'rain', label: 'Rain', icon: CloudRain },
  { id: 'white-noise', label: 'White noise', icon: Wind },
  { id: 'forest', label: 'Forest', icon: Trees },
  { id: 'silence', label: 'Silence', icon: VolumeX },
]

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function StudySession() {
  const [open, setOpen] = useState(false)
  const [minutes, setMinutes] = useState(15)
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState(20)
  const [remaining, setRemaining] = useState(15 * 60)
  const [running, setRunning] = useState(false)
  const [music, setMusic] = useState('silence')
  const [lofiFallback, setLofiFallback] = useState(false)
  const [volume, setVolume] = useState(0.5)
  const [locked, setLocked] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!running) return
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current)
          setRunning(false)
          playTimerFinishedChime()
          if (locked && document.fullscreenElement) document.exitFullscreen().catch(() => {})
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [running, locked])

  useEffect(() => {
    function onFsChange() {
      if (!document.fullscreenElement) setLocked(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  useEffect(
    () => () => {
      stopAmbient()
      stopLofiStream()
    },
    [],
  )

  function selectPreset(m) {
    setMinutes(m)
    setCustomOpen(false)
    setRemaining(m * 60)
    setRunning(false)
  }

  function applyCustom() {
    const m = Math.max(1, Math.min(240, Number(customValue) || 1))
    setMinutes(m)
    setRemaining(m * 60)
    setRunning(false)
  }

  function reset() {
    setRunning(false)
    setRemaining(minutes * 60)
  }

  function closeSession() {
    setOpen(false)
    setRunning(false)
    setMusic('silence')
    stopAmbient()
    stopLofiStream()
    if (locked && document.fullscreenElement) document.exitFullscreen().catch(() => {})
    setLocked(false)
  }

  async function selectMusic(id) {
    setMusic(id)
    stopAmbient()
    stopLofiStream()
    setLofiFallback(false)
    if (id === 'silence') return
    if (id === 'lofi') {
      try {
        await playLofiStream(volume)
      } catch {
        setLofiFallback(true)
        playAmbient('lofi', volume)
      }
      return
    }
    playAmbient(id, volume)
  }

  function changeVolume(v) {
    setVolume(v)
    if (music === 'lofi' && !lofiFallback) setLofiVolume(v)
    else setAmbientVolume(v)
  }

  function toggleLock() {
    if (!locked) {
      document.documentElement
        .requestFullscreen()
        .then(() => setLocked(true))
        .catch(() => {})
      return
    }
    const timerActive = running && remaining > 0
    if (timerActive && !window.confirm("Your timer isn't done yet — exit fullscreen anyway?")) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    setLocked(false)
  }

  const pct = Math.max(0, Math.min(100, 100 - (remaining / (minutes * 60)) * 100))
  const isDone = remaining === 0

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full pl-3.5 pr-4 py-2.5 shadow-lg shadow-blue-600/25 transition">
          {locked ? <Lock size={16} /> : <Timer size={16} />}
          {running ? fmt(remaining) : 'Study session'}
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-40 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="font-display font-semibold text-slate-900 flex items-center gap-1.5 text-sm">
              <Timer size={15} className="text-blue-600" /> Study session
            </p>
            <div className="flex items-center gap-1">
              <button onClick={toggleLock} title={locked ? 'Exit fullscreen lock' : 'Lock into fullscreen for this session'} className={`w-7 h-7 rounded-full flex items-center justify-center transition ${locked ? 'bg-blue-50 text-blue-600' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'}`}>
                {locked ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
              <button onClick={() => setOpen(false)} title="Minimize (keeps running)" className="w-7 h-7 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition">
                <Minus size={14} />
              </button>
              <button onClick={closeSession} title="Close session" className="w-7 h-7 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="p-5">
            {locked && <p className="text-[11px] text-blue-600 bg-blue-50 rounded-lg px-2.5 py-1.5 mb-3 text-center">Fullscreen locked {running ? 'until your timer ends' : '— click the lock icon to exit'}</p>}
            <p className={`text-center font-display text-5xl font-semibold tabular-nums ${isDone ? 'text-emerald-500' : 'text-slate-900'}`}>{isDone ? 'Done!' : fmt(remaining)}</p>
            <div className="h-1.5 bg-slate-100 rounded-full mt-4 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>

            <div className="grid grid-cols-4 gap-1.5 mt-4">
              {PRESETS.map((m) => (
                <button key={m} onClick={() => selectPreset(m)} className={`py-2 rounded-lg text-xs font-medium border transition ${minutes === m && !customOpen ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {m}m
                </button>
              ))}
            </div>
            <button onClick={() => setCustomOpen((v) => !v)} className={`w-full mt-1.5 py-2 rounded-lg text-xs font-medium border transition ${customOpen ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
              Custom
            </button>
            {customOpen && (
              <div className="flex items-center gap-2 mt-2">
                <input type="number" min={1} max={240} value={customValue} onChange={(e) => setCustomValue(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none" />
                <span className="text-xs text-slate-400">min</span>
                <button onClick={applyCustom} className="text-xs font-medium text-blue-600 hover:underline">
                  Set
                </button>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setRunning((r) => !r)} className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl py-2.5 transition">
                {running ? <Pause size={15} /> : <Play size={15} />} {running ? 'Pause' : 'Start'}
              </button>
              <button onClick={reset} className="flex items-center justify-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl px-4 transition">
                <RotateCcw size={14} /> Reset
              </button>
            </div>

            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mt-5 mb-2.5">
              <Music size={12} /> Music
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {MUSIC_OPTIONS.map((m) => (
                <button key={m.id} onClick={() => selectMusic(m.id)} title={m.label} className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[10px] font-medium leading-tight transition ${music === m.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                  <m.icon size={16} />
                  {m.label}
                </button>
              ))}
            </div>
            {music === 'lofi' && lofiFallback && <p className="text-[11px] text-slate-400 mt-2">Playing the offline synthesized version — couldn't reach YouTube for the real track.</p>}
            {music === 'lofi' && !lofiFallback && <p className="text-[11px] text-slate-400 mt-2">Streaming Lofi Girl's radio from YouTube — needs an internet connection.</p>}
            {!isAmbientSupported() && <p className="text-[11px] text-amber-600 mt-2">Ambient audio isn't supported in this browser.</p>}
            <div className="flex items-center gap-2 mt-3">
              <Volume2 size={14} className="text-slate-400 shrink-0" />
              <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => changeVolume(Number(e.target.value))} className="flex-1 accent-blue-600" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
