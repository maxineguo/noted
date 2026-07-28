import { GoogleGenAI } from '@google/genai'
import { throttledCall } from './apiThrottle'

// The doc calls for Gemini 2.5 Flash — still a current, supported model as of writing.
export const MODEL = 'gemini-2.5-flash'
// Fast, low-cost image generation model — used sparingly to keep token/credit usage low.
export const IMAGE_MODEL = 'gemini-2.5-flash-image'
// A male voice by default (was female) — pick any name from the ~30 prebuilt voices to change.
export const VOICE_NAME = 'Puck'

function client(apiKey) {
  if (!apiKey) {
    const err = new Error('Add your Gemini API key in Settings to use AI generation.')
    err.code = 'NO_KEY'
    throw err
  }
  return new GoogleGenAI({ apiKey })
}

function safeJsonParse(text) {
  if (!text) return null
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '')
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        /* fall through */
      }
    }
    const arrStart = cleaned.indexOf('[')
    const arrEnd = cleaned.lastIndexOf(']')
    if (arrStart !== -1 && arrEnd !== -1) {
      try {
        return JSON.parse(cleaned.slice(arrStart, arrEnd + 1))
      } catch {
        /* fall through */
      }
    }
    return null
  }
}

function friendlyError(e) {
  const msg = String(e?.message || e)
  if (e?.code === 'NO_KEY') return msg
  if (/api key not valid|API_KEY_INVALID|invalid.*key/i.test(msg)) return 'That Gemini API key was rejected. Double check it in Settings.'
  if (/quota|rate.?limit|429/i.test(msg)) return "You've hit your Gemini API rate limit or free quota. Wait a moment and try again — Noted already spaces out requests, but free-tier limits are strict."
  if (/network|fetch/i.test(msg)) return 'Could not reach the Gemini API — check your internet connection.'
  return `Gemini API error: ${msg}`
}

export async function testApiKey(apiKey) {
  const ai = client(apiKey)
  await throttledCall(() => ai.models.generateContent({ model: MODEL, contents: 'Reply with the single word: ok' }))
  return true
}

// ---------- Source material assembly ----------
function sourcesToParts(sources, charBudgetPerSource = 15000) {
  const textBits = []
  const imageParts = []
  const fileDataParts = []
  const websiteUrls = []
  for (const s of sources || []) {
    if (s.kind === 'youtube' && s.url) {
      fileDataParts.push({ fileData: { fileUri: s.url, mimeType: 'video/*' } })
    } else if (s.kind === 'website' && s.url) {
      websiteUrls.push(s.url)
    } else if (s.textContent) {
      textBits.push(`--- Source: ${s.name} ---\n${s.textContent.slice(0, charBudgetPerSource)}`)
    } else if (s.imageDataUrl) {
      const match = s.imageDataUrl.match(/^data:(.*);base64,(.*)$/)
      if (match) imageParts.push({ inlineData: { mimeType: match[1], data: match[2] } })
    } else if (s.audioDataUrl) {
      const match = s.audioDataUrl.match(/^data:(.*);base64,(.*)$/)
      if (match) imageParts.push({ inlineData: { mimeType: match[1], data: match[2] } })
    } else if (s.videoDataUrl) {
      const match = s.videoDataUrl.match(/^data:(.*);base64,(.*)$/)
      if (match) fileDataParts.push({ inlineData: { mimeType: match[1], data: match[2] } })
    }
  }
  return { textBits, imageParts, fileDataParts, websiteUrls }
}

function buildGenerationRequest(sources, instructions) {
  const { textBits, imageParts, fileDataParts, websiteUrls } = sourcesToParts(sources)
  const fullText = `${instructions}${websiteUrls.length ? `\n\nAlso use the content at these URLs as source material: ${websiteUrls.join(', ')}` : ''}\n\n${textBits.join('\n\n')}`
  const allParts = [{ text: fullText }, ...imageParts, ...fileDataParts]
  const contents = allParts.length > 1 ? [{ role: 'user', parts: allParts }] : fullText
  const config = { responseMimeType: 'application/json', temperature: 0.4 }
  if (websiteUrls.length) config.tools = [{ urlContext: {} }]
  return { contents, config, hasAny: !!(textBits.length || imageParts.length || fileDataParts.length || websiteUrls.length) }
}

// ---------- Phase 1: topic plan (fast, cheap — always run first) ----------
export async function generateTopicPlan({ apiKey, title, sources }) {
  const ai = client(apiKey)
  const instructions = `You are the content engine for a study app called Noted. A student is studying "${title}". Read the attached source material and plan out its structure.

Return ONLY JSON, nothing else, no markdown fences, in exactly this shape:
{
  "topics": string[] (4-6 short topic chips, 1-3 words each),
  "noteTopics": [ { "title": string, "mainIdea": string } ] (every major section/topic the source actually covers — however many that genuinely is, don't force a round number. "mainIdea" is ONE sentence capturing the core point of that section, not just restating the title.),
  "reviewPrompts": string[] (4-6 broad short-answer prompts spanning every topic, phrased like "Explain...", "Describe...", "Compare...")
}`
  const { contents, config, hasAny } = buildGenerationRequest(sources, instructions)
  if (!hasAny) throw new Error('Add at least one source with real content before generating.')
  try {
    const response = await throttledCall(() => ai.models.generateContent({ model: MODEL, contents, config }))
    const data = safeJsonParse(response.text)
    if (!data || !data.noteTopics?.length) throw new Error('The model returned something unexpected. Please try again.')
    data.topics = data.topics || []
    data.reviewPrompts = data.reviewPrompts || []
    return data
  } catch (e) {
    throw new Error(friendlyError(e))
  }
}

// ---------- Phase 2a: lecture script ----------
export async function generateLecture({ apiKey, title, sources, noteTopics }) {
  const ai = client(apiKey)
  const topicList = (noteTopics || []).map((t) => `- ${t.title}: ${t.mainIdea}`).join('\n')
  const instructions = `You are writing a spoken lecture for a study app called Noted, for a student studying "${title}". The material covers these topics:\n${topicList}\n\nRead the attached source material and write a complete spoken-lecture script covering ALL of it.

Return ONLY JSON, nothing else, no markdown fences:
{ "chapters": [ { "title": string, "script": string, "questions": [ { "fraction": number, "question": string } ] } ] }

- 3-6 chapters that together narrate the whole source out loud. Each "script" is 150-300 words, written to be read aloud (no bullet points, no markdown, no headers).
- Each chapter's "questions" has 0-2 short comprehension questions, "fraction" = roughly how far through THAT chapter's script it comes up (0 to 1). Most chapters can have an empty questions array.`
  const { contents, config, hasAny } = buildGenerationRequest(sources, instructions)
  if (!hasAny) throw new Error('Add at least one source with real content before generating.')
  try {
    const response = await throttledCall(() => ai.models.generateContent({ model: MODEL, contents, config }))
    const data = safeJsonParse(response.text)
    if (!data?.chapters?.length) throw new Error('The model returned something unexpected. Please try again.')
    return data
  } catch (e) {
    throw new Error(friendlyError(e))
  }
}

// ---------- Phase 2b: per-topic detailed notes (generated one topic at a time, lazily) ----------
// Each topic gets its OWN full-budget call so detail is never sacrificed to fit everything
// into one shared response — directly serves "don't lose a single detail."
export async function generateTopicNotes({ apiKey, sources, topic, allTopics }) {
  const ai = client(apiKey)
  const otherTitles = (allTopics || []).filter((t) => t.title !== topic.title).map((t) => t.title)
  const instructions = `You are writing one section of a student's exhaustive study notes for a notebook. This section covers ONLY the topic "${topic.title}" (main idea: ${topic.mainIdea}). The notebook's other sections (do NOT repeat their content here, but you may reference them briefly) are: ${otherTitles.join(', ') || '(none)'}.

Read the attached source material and write EXHAUSTIVE, encyclopedia-style markdown notes for ONLY this topic. Capture every fact, name, date, number, term, definition, and detail related to this topic anywhere in the source, no matter how minor. Do not summarize or skip anything to save space. Use ## sub-headers for sub-sections within this topic if it has natural sub-parts, and use "- " for bullet lists where that fits the content better than prose. If this topic is genuinely rich in the source, this should be long — length is not a concern, completeness is.

Return ONLY JSON, nothing else, no markdown fences: { "detailed": string }`
  const { contents, config, hasAny } = buildGenerationRequest(sources, instructions)
  if (!hasAny) throw new Error('Add at least one source with real content before generating.')
  try {
    const response = await throttledCall(() => ai.models.generateContent({ model: MODEL, contents, config }))
    const data = safeJsonParse(response.text)
    if (!data?.detailed) throw new Error('The model returned something unexpected. Please try again.')
    return data.detailed
  } catch (e) {
    throw new Error(friendlyError(e))
  }
}

// Reformats (not condenses) a block of notes text to a strict line budget: reorder logically,
// merge repeats, rephrase tighter — but only actually shortens content if it still doesn't fit.
export async function reformatNotesToLineBudget({ apiKey, text, maxLines }) {
  const ai = client(apiKey)
  const prompt = `Reformat the following study notes to fit within an ABSOLUTE LIMIT of ${maxLines} lines (assume ~95 characters per line). Your first priority is to remove exact repeats, put everything in a logical order, and rephrase more tightly — WITHOUT losing any distinct fact, name, date, number, or detail. Only if it is truly impossible to fit every detail even after tightening the wording should you condense/drop the least important details, as a last resort.

Return ONLY the reformatted notes as plain text with "## " for section headers and "- " for bullet points where useful. No commentary, no markdown fences.

NOTES:
${text}`
  try {
    const response = await throttledCall(() => ai.models.generateContent({ model: MODEL, contents: prompt, config: { temperature: 0.3 } }))
    return response.text?.trim() || text
  } catch (e) {
    console.warn('Reformat failed, using original text', e)
    return text
  }
}

// ---------- Phase 2c: practice set ----------
export async function generatePractice({ apiKey, title, sources }) {
  const ai = client(apiKey)
  const instructions = `You are writing a practice question bank for a study app called Noted, for a student studying "${title}". Read the attached source material.

Return ONLY JSON, nothing else, no markdown fences:
{
  "concepts": [ { "question": string, "options": string[], "answerIndex": number, "hint": string, "explanation": string } ],
  "vocabulary": [ { "term": string, "definition": string, "hint": string } ],
  "people": [ { "question": string, "options": string[], "answerIndex": number, "hint": string } ],
  "formulas": [ { "term": string, "definition": string, "hint": string } ],
  "problems": [ { "prompt": string, "solution": string, "workedSteps": string } ],
  "application": [ { "question": string, "options": string[], "answerIndex": number, "hint": string, "explanation": string } ]
}

- "concepts": 8-10 multiple choice questions (exactly 4 options each, one correct) testing understanding, not just recall. "explanation" is 1-2 sentences explaining why the answer is correct, shown to the student after they answer.
- "vocabulary": EVERY genuinely key term the source actually defines or relies on — a flexible count based on how much the source has, not a fixed target. Don't pad with trivial terms, don't skip real ones.
- "people": multiple choice questions about named people/figures in the source. Empty array if the source names no people.
- "formulas": term/definition pairs for named formulas, equations, or laws in the source. Empty array if the source has no formulas.
- "problems": worked practice problems ONLY if the source is the kind of subject with solvable problems (math, physics, chemistry, etc.). Empty array otherwise.
- "application": ONLY for subjects where applying a concept/formula to a new real-world scenario makes sense (math word problems, science scenarios, economics, etc.) — multiple choice, exactly 4 options, testing whether the student can APPLY something from the source to a new situation they haven't seen verbatim. "explanation" required, same as concepts. Return an EMPTY array for subjects like history, literature, or language where this doesn't naturally apply — do not force it.
- Every hint gives a clue without revealing the answer outright.
- Base everything strictly on the provided source material. Do not invent facts absent from it.`
  const { contents, config, hasAny } = buildGenerationRequest(sources, instructions)
  if (!hasAny) throw new Error('Add at least one source with real content before generating.')
  try {
    const response = await throttledCall(() => ai.models.generateContent({ model: MODEL, contents, config }))
    const data = safeJsonParse(response.text)
    if (!data) throw new Error('The model returned something unexpected. Please try again.')
    data.concepts = data.concepts || []
    data.vocabulary = data.vocabulary || []
    data.people = data.people || []
    data.formulas = data.formulas || []
    data.problems = data.problems || []
    data.application = data.application || []
    return data
  } catch (e) {
    throw new Error(friendlyError(e))
  }
}

// ---------- Context for Chat / Teach / lazy specials ----------
function buildContext(notebook) {
  const bits = []
  const topics = notebook.notes?.topics || []
  if (topics.length) {
    topics.forEach((t) => bits.push(t.detailed ? `## ${t.title}\n${t.detailed}` : `## ${t.title}\n(${t.mainIdea})`))
  }
  for (const s of notebook.sources || []) {
    if (s.textContent) bits.push(`Source "${s.name}":\n${s.textContent.slice(0, 6000)}`)
  }
  const joined = bits.join('\n\n').slice(0, 28000)
  return joined || `Notebook titled "${notebook.title}" covering: ${(notebook.topics || []).join(', ')}`
}

const LAZY_SPECIAL_SCHEMAS = {
  mindmap: '{ "mindmap": { "root": string, "branches": NODE[] } }  where NODE = { "label": string, "children": NODE[] }',
  timeline: '{ "timeline": [ { "date": string, "event": string } ] }',
  chart: '{ "chart": { "title": string, "xLabel": string, "yLabel": string, "caption": string, "data": [ { "label": string, "value": number } ] } }',
  graphs: '{ "graphs": [ { "kind": "flow", "title": string, "caption": string, "steps": string[] } ], "graphImagePrompts": [ { "prompt": string, "caption": string } ] }',
}
const LAZY_SPECIAL_INSTRUCTIONS = {
  mindmap:
    'Build a mindmap of how the concepts in this material connect, as a RECURSIVE tree: the root idea, its first-level branches, and then each branch\'s own children, going as many levels deep as the material naturally supports (typically 2-4 levels). Keep every "label" SHORT (1-4 words) so it reads clearly inside a small node — this is critical. Leaf nodes should have an empty or omitted "children" array.',
  timeline: 'Extract a chronological timeline of dated events from this material.',
  chart:
    'Find ONE genuinely meaningful comparison to chart from this material, using ONLY numbers that are explicitly stated in the source or directly, unambiguously computable from it — never estimate, round dramatically, or invent a number. Give real, specific "xLabel" and "yLabel" values that concretely describe what each axis measures with correct units (e.g. "Year", "Number of people (millions)", "Population", "Percent of GDP") so the chart is fully self-explanatory. If the source truly has no solid quantitative data worth comparing, return an empty "data" array rather than fabricating one — accuracy matters far more than always having a chart.',
  graphs:
    "Describe 1-2 short step-by-step processes or causal chains from this material as flow diagrams (3-6 short steps each, a few words per step). Also suggest 1-3 short, vivid, self-contained image-generation prompts for illustrations that would genuinely help this specific material (a labeled diagram, a depicted scene/object/place relevant to the topic). Never depict or name a specific real person in an image prompt — describe generic figures, objects, or scenes instead.",
}

export async function generateLazySpecial({ apiKey, notebook, kind }) {
  const ai = client(apiKey)
  const context = buildContext(notebook)
  const prompt = `Reference material:\n${context}\n\n${LAZY_SPECIAL_INSTRUCTIONS[kind]}\n\nReturn ONLY JSON, nothing else, no markdown fences, in exactly this shape:\n${LAZY_SPECIAL_SCHEMAS[kind]}`
  try {
    const response = await throttledCall(() =>
      ai.models.generateContent({ model: MODEL, contents: prompt, config: { responseMimeType: 'application/json', temperature: kind === 'chart' ? 0.1 : 0.5 } }),
    )
    const data = safeJsonParse(response.text)
    if (!data) throw new Error('Could not generate that — please try again.')
    return data
  } catch (e) {
    throw new Error(friendlyError(e))
  }
}

export async function generateLectureImagePrompts({ apiKey, notebook }) {
  const ai = client(apiKey)
  const chapters = notebook.lecture?.chapters || []
  const chapterSummary = chapters.map((c, i) => `Chapter ${i}: ${c.title}\n${c.script.slice(0, 400)}`).join('\n\n')
  const prompt = `Here are the chapters of a lecture:\n\n${chapterSummary}\n\nSuggest 3-7 short, vivid, self-contained image-generation prompts to illustrate this lecture, each tied to a specific chapter via "chapterIndex" (matching the chapter numbers above, 0-indexed). Never depict or name a specific real person — describe generic scenes, objects, or diagrams instead.\n\nReturn ONLY JSON, nothing else, no markdown fences: [ { "chapterIndex": number, "prompt": string, "caption": string } ]`
  try {
    const response = await throttledCall(() => ai.models.generateContent({ model: MODEL, contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.5 } }))
    const data = safeJsonParse(response.text)
    return Array.isArray(data) ? data.slice(0, 7) : []
  } catch (e) {
    throw new Error(friendlyError(e))
  }
}

// A handful of small illustrations (not full HD art) — generated sparingly. Never depicts real
// named people. Retries once on failure. Throws with a specific reason on failure (rather than
// silently returning null) so the UI can tell the student what actually happened.
export async function generateIllustration({ apiKey, prompt }) {
  const ai = client(apiKey)
  const attempt = () =>
    throttledCall(() =>
      ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: `${prompt}. Simple, clean illustration style, no text or watermarks, no real named public figures.`,
        config: { responseModalities: ['IMAGE'] },
      }),
    )
  let lastError = null
  for (let tryNum = 0; tryNum < 2; tryNum++) {
    try {
      const response = await attempt()
      const candidate = response.candidates?.[0]
      const parts = candidate?.content?.parts || []
      const imgPart = parts.find((p) => p.inlineData)
      if (imgPart) return `data:${imgPart.inlineData.mimeType || 'image/png'};base64,${imgPart.inlineData.data}`
      const reason = candidate?.finishReason
      lastError = reason && reason !== 'STOP' ? new Error(`Image generation was blocked (${reason}).`) : new Error('No image came back from the model.')
      console.warn(`Illustration attempt ${tryNum + 1} produced no image`, response)
    } catch (e) {
      lastError = e
      console.warn(`Illustration generation attempt ${tryNum + 1} failed`, e)
    }
  }
  throw new Error(friendlyError(lastError || new Error('Illustration generation failed.')))
}

const CUSTOM_SPECIAL_SCHEMAS = {
  slidedeck: '{ "title": string, "slides": [ { "title": string, "bullets": string[] } ] }',
  flashcards: '{ "title": string, "cards": [ { "term": string, "definition": string } ] }',
  infographic: '{ "title": string, "stats": [ { "value": string, "label": string } ], "highlights": string[] }',
  report: '{ "title": string, "sections": [ { "heading": string, "paragraphs": string[] } ] }',
  custom: '{ "title": string, "sections": [ { "heading": string, "paragraphs": string[] } ] }',
}
const CUSTOM_SPECIAL_INSTRUCTIONS = {
  slidedeck: 'Create a slide deck outline: 6-10 slides, each with a short title and 2-4 short bullet points.',
  flashcards: 'Create a set of flashcards (term + definition pairs) covering the material — as many as the material genuinely supports.',
  infographic: 'Create infographic content: 4-8 short "stat" callouts (a bold value + a short label) plus a few one-line highlight facts.',
  report: 'Write a structured short report with clear section headings and a few short paragraphs under each.',
  custom: "Create whatever best fits the student's request below, structured as clear sections with short paragraphs.",
}

export async function generateCustomSpecial({ apiKey, notebook, type, focus }) {
  const ai = client(apiKey)
  const context = buildContext(notebook)
  const focusLine = focus?.trim() ? `Focus specifically on: ${focus.trim()}` : ''
  const prompt = `Reference material:\n${context}\n\n${CUSTOM_SPECIAL_INSTRUCTIONS[type] || CUSTOM_SPECIAL_INSTRUCTIONS.custom}\n${focusLine}\n\nBase everything strictly on the reference material — do not invent facts.\n\nReturn ONLY JSON, nothing else, no markdown fences, in exactly this shape:\n${CUSTOM_SPECIAL_SCHEMAS[type] || CUSTOM_SPECIAL_SCHEMAS.custom}`
  try {
    const response = await throttledCall(() => ai.models.generateContent({ model: MODEL, contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.55 } }))
    const data = safeJsonParse(response.text)
    if (!data) throw new Error('Could not generate that — please try again.')
    return data
  } catch (e) {
    throw new Error(friendlyError(e))
  }
}

// Picks a background "theme" for the slide-deck view based on subject — history/math/lit/
// science/government/arts — used client-side only (no API call needed).
export function inferSubjectTheme(notebook) {
  const text = `${notebook.title} ${(notebook.topics || []).join(' ')}`.toLowerCase()
  const rules = [
    { theme: 'science', words: ['biology', 'chemistry', 'physics', 'science', 'cell', 'atom', 'molecule', 'organism', 'energy'] },
    { theme: 'math', words: ['math', 'algebra', 'calculus', 'geometry', 'equation', 'statistics', 'trigonometry'] },
    { theme: 'history', words: ['history', 'war', 'revolution', 'empire', 'century', 'ancient', 'medieval'] },
    { theme: 'government', words: ['government', 'politics', 'civics', 'constitution', 'law', 'policy', 'democracy'] },
    { theme: 'literature', words: ['literature', 'english', 'novel', 'poem', 'poetry', 'reading', 'language', 'spanish', 'french', 'grammar', 'vocabulary'] },
    { theme: 'arts', words: ['art', 'music', 'painting', 'drawing', 'theater', 'theatre', 'design'] },
  ]
  for (const r of rules) {
    if (r.words.some((w) => text.includes(w))) return r.theme
  }
  return 'default'
}

export async function chatWithNotebook({ apiKey, notebook, history, message }) {
  const ai = client(apiKey)
  const context = buildContext(notebook)
  const sys = `You are a focused, encouraging study tutor for a student working through their notebook titled "${notebook.title}". Answer using ONLY the reference material below — say so if something isn't covered by it. Keep answers tight and clear (a few sentences to a short paragraph). You may use **bold** (double asterisks) for emphasis on key terms, but otherwise keep formatting plain — no headers, no bullet lists. When it fits naturally, end by offering to generate a few targeted practice questions on what was just discussed.\n\nREFERENCE MATERIAL:\n${context}`

  const contents = [
    ...history
      .filter((m) => m.content && m.content !== '__TARGETED_PRACTICE__')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ]

  try {
    const response = await throttledCall(() =>
      ai.models.generateContent({ model: MODEL, contents, config: { systemInstruction: sys, temperature: 0.6 } }),
    )
    return response.text
  } catch (e) {
    throw new Error(friendlyError(e))
  }
}

export async function generateTargetedPractice({ apiKey, notebook, topic }) {
  const ai = client(apiKey)
  const context = buildContext(notebook)
  const prompt = `Reference material:\n${context}\n\nWrite exactly 3 short, targeted practice questions about: "${topic}". For each, also give a concise explanation/answer a student could check their work against. Return ONLY JSON, nothing else, no markdown fences, in this exact shape:
[ { "question": string, "explanation": string }, { "question": string, "explanation": string }, { "question": string, "explanation": string } ]`
  try {
    const response = await throttledCall(() =>
      ai.models.generateContent({ model: MODEL, contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.5 } }),
    )
    const data = safeJsonParse(response.text)
    return Array.isArray(data) ? data.slice(0, 3) : []
  } catch (e) {
    throw new Error(friendlyError(e))
  }
}

export async function generateMoreQuestions({ apiKey, notebook, category, existingQuestions = [], count = 10 }) {
  const ai = client(apiKey)
  const context = buildContext(notebook)
  const categoryLabel = category === 'people' ? 'people or figures named in the source' : category === 'application' ? 'real-world application / word-problem style scenarios using concepts or formulas from the source' : 'concepts and understanding'
  const prompt = `Reference material:\n${context}\n\nWrite ${count} NEW multiple choice questions about ${categoryLabel} from this material. Each needs exactly 4 options, one correct answer, a hint that gives a clue without revealing the answer, and an "explanation" (1-2 sentences, shown after the student answers).

Do not repeat or closely rephrase any of these already-asked questions:
${existingQuestions.length ? existingQuestions.map((q) => `- ${q}`).join('\n') : '(none yet)'}

Return ONLY a JSON array, nothing else, no markdown fences, in this exact shape:
[ { "question": string, "options": string[], "answerIndex": number, "hint": string, "explanation": string } ]`
  try {
    const response = await throttledCall(() =>
      ai.models.generateContent({ model: MODEL, contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.65 } }),
    )
    const data = safeJsonParse(response.text)
    return Array.isArray(data) ? data.slice(0, count) : []
  } catch (e) {
    throw new Error(friendlyError(e))
  }
}

export async function evaluateTeaching({ apiKey, notebook, transcript, whiteboardImageDataUrl, docText, topics, previousFeedback = [], newSinceCheckpoint = '' }) {
  const ai = client(apiKey)
  const context = buildContext(notebook)
  const isFirstCheck = previousFeedback.length === 0 && !newSinceCheckpoint
  const promptText = `A student is using the Feynman technique: teaching this material back to you out loud (or in writing), as if you were a beginner. Topics they were asked to cover: ${topics.map((t) => t.label).join(', ')}.

REFERENCE MATERIAL:
${context}

FULL TRANSCRIPT/NOTES SO FAR (use this to judge overall topic coverage):
"""${transcript || '(nothing said yet)'}"""

STUDENT'S TYPED NOTES WHILE EXPLAINING (doc tool, may be empty):
"""${docText || '(empty)'}"""
${
  isFirstCheck
    ? ''
    : `\nThis is a follow-up check. You already gave this feedback earlier — do NOT repeat these points, even rephrased: ${previousFeedback.map((f) => `"${f.title}"`).join('; ') || '(none)'}.\nFocus your NEW feedback mainly on what's been added since the last check:\n"""${newSinceCheckpoint || '(nothing new was added)'}"""\nIt's fine to return an empty "feedback" array if there's genuinely nothing new worth flagging.`
}

Return ONLY JSON with this exact shape, nothing else:
{
  "masteryScore": number (0-100, reflecting the FULL transcript so far, not just what's new),
  "topicsCovered": string[] (the subset of the given topic list the student has addressed across the FULL transcript, matched by exact label),
  "feedback": [ { "kind": "good" | "warn" | "error", "title": string, "body": string } ] (0-4 NEW items only: praise real strengths as "good", flag under-explained points as "warn", flag factual errors as "error"),
  "summary": string (2-3 encouraging but honest sentences on what to review next, considering everything so far)
}`

  const parts = [{ text: promptText }]
  if (whiteboardImageDataUrl) {
    const match = whiteboardImageDataUrl.match(/^data:(.*);base64,(.*)$/)
    if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
  }

  try {
    const response = await throttledCall(() =>
      ai.models.generateContent({ model: MODEL, contents: [{ role: 'user', parts }], config: { responseMimeType: 'application/json', temperature: 0.4 } }),
    )
    const data = safeJsonParse(response.text)
    if (!data) throw new Error('Could not score that attempt — please try finishing again.')
    data.feedback = data.feedback || []
    data.topicsCovered = data.topicsCovered || []
    return data
  } catch (e) {
    throw new Error(friendlyError(e))
  }
}

// ---------- Audio/video transcription ----------
// Uses the Files API (not inline data) so large recordings work without any client-side
// re-encoding or chunking — Google's own infrastructure handles the heavy lifting. Produces a
// real text transcript that becomes a first-class source for every other stage.
export async function transcribeMediaFile({ apiKey, file, onProgress }) {
  const ai = client(apiKey)
  const prompt = 'Transcribe this audio/video verbatim and completely, as thoroughly and accurately as you can. Return ONLY the transcript text, no commentary, no timestamps, no speaker labels unless multiple speakers are clearly distinguishable.'
  try {
    onProgress?.('Uploading…')
    const uploaded = await throttledCall(() => ai.files.upload({ file, config: { mimeType: file.type || 'application/octet-stream' } }))
    const fileUri = uploaded.uri
    const mimeType = uploaded.mimeType || file.type
    onProgress?.('Transcribing…')
    const attempt = () =>
      throttledCall(() =>
        ai.models.generateContent({ model: MODEL, contents: [{ role: 'user', parts: [{ text: prompt }, { fileData: { fileUri, mimeType } }] }] }),
      )
    let response
    try {
      response = await attempt()
    } catch {
      // Video in particular can still be processing right after upload — wait and retry once.
      await new Promise((r) => setTimeout(r, 6000))
      response = await attempt()
    }
    const text = response.text?.trim()
    if (!text) throw new Error('No transcript came back for that file.')
    return text
  } catch (e) {
    throw new Error(friendlyError(e))
  }
}
