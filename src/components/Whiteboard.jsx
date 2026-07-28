import { forwardRef, useRef, useEffect, useImperativeHandle, useState } from 'react'
import { Pencil, Square, Circle, Type, Eraser, Trash2 } from 'lucide-react'

const COLORS = ['#0f172a', '#dc2626', '#2563eb', '#16a34a', '#f59e0b']
const TOOLS = [
  { id: 'pen', icon: Pencil, label: 'Pen' },
  { id: 'rect', icon: Square, label: 'Rectangle' },
  { id: 'circle', icon: Circle, label: 'Circle' },
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
]

const Whiteboard = forwardRef(function Whiteboard(_, ref) {
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const drawing = useRef(false)
  const startPos = useRef({ x: 0, y: 0 })
  const snapshotRef = useRef(null)
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState(COLORS[0])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctxRef.current = ctx
  }, [])

  useImperativeHandle(ref, () => ({
    getDataUrl: () => canvasRef.current?.toDataURL('image/png'),
    clear: () => {
      const canvas = canvasRef.current
      const ctx = ctxRef.current
      if (!canvas || !ctx) return
      const rect = canvas.getBoundingClientRect()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, rect.width, rect.height)
    },
  }))

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const point = e.touches ? e.touches[0] : e
    return { x: point.clientX - rect.left, y: point.clientY - rect.top }
  }

  function handleStart(e) {
    e.preventDefault()
    const pos = getPos(e)
    startPos.current = pos
    const ctx = ctxRef.current
    if (tool === 'pen' || tool === 'eraser') {
      drawing.current = true
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    } else if (tool === 'rect' || tool === 'circle') {
      drawing.current = true
      snapshotRef.current = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)
    } else if (tool === 'text') {
      const text = window.prompt('Text to add:')
      if (text) {
        ctx.fillStyle = color
        ctx.font = '20px "Space Grotesk", sans-serif'
        ctx.fillText(text, pos.x, pos.y)
      }
    }
  }

  function handleMove(e) {
    if (!drawing.current) return
    e.preventDefault()
    const pos = getPos(e)
    const ctx = ctxRef.current
    if (tool === 'pen') {
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    } else if (tool === 'eraser') {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 18
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    } else if (tool === 'rect' || tool === 'circle') {
      if (snapshotRef.current) ctx.putImageData(snapshotRef.current, 0, 0)
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      if (tool === 'rect') {
        ctx.strokeRect(startPos.current.x, startPos.current.y, pos.x - startPos.current.x, pos.y - startPos.current.y)
      } else {
        const rx = Math.abs(pos.x - startPos.current.x) / 2
        const ry = Math.abs(pos.y - startPos.current.y) / 2
        const cx = (pos.x + startPos.current.x) / 2
        const cy = (pos.y + startPos.current.y) / 2
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  function handleEnd() {
    drawing.current = false
    snapshotRef.current = null
  }

  function clearBoard() {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        {TOOLS.map((t) => (
          <button key={t.id} onClick={() => setTool(t.id)} title={t.label} className={`w-9 h-9 rounded-lg flex items-center justify-center transition ${tool === t.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
            <t.icon size={16} />
          </button>
        ))}
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <div className="flex items-center gap-2.5">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full transition ${color === c ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`} style={{ backgroundColor: c }} aria-label={c} />
          ))}
        </div>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button onClick={clearBoard} title="Clear board" className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition">
          <Trash2 size={16} />
        </button>
        <span className="text-xs text-slate-400 ml-auto capitalize hidden sm:inline">{tool} tool</span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl border border-slate-200 touch-none cursor-crosshair"
        style={{ height: 340, backgroundImage: 'radial-gradient(circle, #e2e8f0 1px, transparent 1px)', backgroundSize: '16px 16px' }}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />
    </div>
  )
})

export default Whiteboard
