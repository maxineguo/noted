let pdfjsLibPromise = null
async function getPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
      return mod
    })
  }
  return pdfjsLibPromise
}

function wordCount(s) {
  return (String(s || '').match(/\S+/g) || []).length
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Video isn't stored in full (too large for localStorage) — pull one representative frame so
// Gemini still has visual context from it.
export async function extractVideoThumbnail(file, atSeconds = 1) {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Could not read video metadata'))
    })
    const seekTime = Math.min(Math.max(atSeconds, 0.1), Math.max(0.1, video.duration * 0.25))
    await new Promise((resolve, reject) => {
      video.onseeked = () => resolve()
      video.onerror = () => reject(new Error('Could not seek video'))
      video.currentTime = seekTime
    })
    const maxDim = 900
    let w = video.videoWidth
    let h = video.videoHeight
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(video, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.78)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Small audio clips get sent to Gemini directly (it can transcribe/understand audio); large
// ones just get stored as metadata so we don't blow the localStorage budget.
export async function fileToAudioDataUrl(file, maxBytes = 4 * 1024 * 1024) {
  if (file.size > maxBytes) return null
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Same idea for short video clips — Gemini can actually watch/listen to these (not just see a
// still frame) as long as they're small enough to send inline.
export async function fileToVideoDataUrl(file, maxBytes = 15 * 1024 * 1024) {
  if (file.size > maxBytes) return null
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function readTextFile(file) {
  return await file.text()
}

export async function extractPdfText(file) {
  const pdfjsLib = await getPdfjs()
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  let text = ''
  const maxPages = Math.min(pdf.numPages, 60)
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n\n'
  }
  return { text: text.trim(), pages: pdf.numPages }
}

// Downscales so a photo of a whiteboard doesn't blow past localStorage's ~5-10MB budget.
export async function fileToDownscaledImageDataUrl(file, maxDim = 1600, quality = 0.82) {
  const rawDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  return await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = rawDataUrl
  })
}

// Turns any dropped/selected File into a normalized source record ready to store on a notebook.
export async function processUploadedFile(file) {
  const name = file.name
  const ext = (name.split('.').pop() || '').toLowerCase()
  const sizeLabel = formatBytes(file.size)

  if (ext === 'txt' || ext === 'md') {
    const text = await readTextFile(file)
    return { name, kind: 'text', meta: `Text · ${wordCount(text)} words`, textContent: text, imageDataUrl: null }
  }
  if (ext === 'pdf') {
    try {
      const { text, pages } = await extractPdfText(file)
      if (text && text.length > 40) {
        return { name, kind: 'pdf', meta: `PDF · ${pages} pages`, textContent: text, imageDataUrl: null }
      }
      return { name, kind: 'pdf', meta: `PDF · ${sizeLabel} · scanned, no extractable text`, textContent: null, imageDataUrl: null }
    } catch (e) {
      console.error('PDF parse failed', e)
      return { name, kind: 'pdf', meta: `PDF · ${sizeLabel} · could not read this file`, textContent: null, imageDataUrl: null }
    }
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    const imageDataUrl = await fileToDownscaledImageDataUrl(file)
    return { name, kind: 'image', meta: `Image · ${sizeLabel}`, textContent: null, imageDataUrl }
  }
  if (['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v'].includes(ext)) {
    const videoDataUrl = await fileToVideoDataUrl(file)
    let imageDataUrl = null
    try {
      imageDataUrl = await extractVideoThumbnail(file)
    } catch (e) {
      console.error('Video thumbnail failed', e)
    }
    return {
      name,
      kind: 'video',
      meta: videoDataUrl ? `Video · ${sizeLabel} · full video analyzed` : `Video · ${sizeLabel} · too long to analyze in full — using a preview frame only (try a shorter clip for real video understanding)`,
      textContent: null,
      imageDataUrl,
      videoDataUrl,
    }
  }
  if (['mp3', 'wav', 'm4a', 'ogg', 'aac'].includes(ext)) {
    const audioDataUrl = await fileToAudioDataUrl(file)
    return {
      name,
      kind: 'audio',
      meta: audioDataUrl ? `Audio · ${sizeLabel}` : `Audio · ${sizeLabel} · too large to analyze — try a shorter clip`,
      textContent: null,
      imageDataUrl: null,
      audioDataUrl,
    }
  }
  if (['ppt', 'pptx'].includes(ext)) {
    return { name, kind: 'slides', meta: `Slides · ${sizeLabel} · paste key text below for best results`, textContent: null, imageDataUrl: null }
  }
  if (['doc', 'docx'].includes(ext)) {
    return { name, kind: 'doc', meta: `Document · ${sizeLabel} · paste text below for best results`, textContent: null, imageDataUrl: null }
  }
  return { name, kind: 'other', meta: sizeLabel, textContent: null, imageDataUrl: null }
}

// Recompresses an existing data URL (e.g. a freshly generated illustration) to keep
// localStorage usage reasonable.
export async function downscaleDataUrl(dataUrl, maxDim = 800, quality = 0.75) {
  return await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

export function pastedTextSource(text, label = 'Pasted text') {
  return { name: label, kind: 'text', meta: `Text · ${wordCount(text)} words`, textContent: text, imageDataUrl: null }
}
