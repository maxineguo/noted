import { useState } from 'react'
import { Brain, ListChecks, Users, Sigma, Compass, Lightbulb, SkipForward, X, CheckCircle2, XCircle, Calculator, Eye } from 'lucide-react'
import { generateMoreQuestions, generatePractice } from '../../lib/gemini'
import { PrimaryButton, SecondaryButton, EmptyHint, Spinner, StageGate } from '../ui.jsx'

const BATCH_SIZE = 10

const CATEGORY_META = {
  concepts: { label: 'Concepts', icon: Brain, gradient: 'from-blue-500 to-blue-700' },
  vocabulary: { label: 'Vocabulary', icon: ListChecks, gradient: 'from-teal-400 to-emerald-600' },
  people: { label: 'People', icon: Users, gradient: 'from-amber-400 to-orange-600' },
  formulas: { label: 'Formulas', icon: Sigma, gradient: 'from-violet-400 to-purple-700' },
  application: { label: 'Application', icon: Compass, gradient: 'from-rose-400 to-pink-600' },
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Vocabulary/formulas are stored as {term, definition, hint} — build MCQ on the fly by
// sampling distractor definitions from sibling terms.
function deriveMCQ(items) {
  return items.map((item, index) => {
    const pool = items.filter((_, i) => i !== index)
    const distractors = shuffle(pool)
      .slice(0, Math.min(3, pool.length))
      .map((p) => p.definition)
    const options = shuffle([item.definition, ...distractors])
    return { question: `What does "${item.term}" mean?`, options, answerIndex: options.indexOf(item.definition), hint: item.hint, explanation: `${item.term}: ${item.definition}` }
  })
}

export default function PracticeStage({ notebook, onSave, apiKey, onNeedApiKey }) {
  const enabled = !!notebook.stageEnabled?.practice
  const ready = enabled && !!notebook.practice
  const [enableBusy, setEnableBusy] = useState(false)
  const [enableError, setEnableError] = useState('')

  async function enablePractice() {
    if (!apiKey) {
      onNeedApiKey()
      return
    }
    setEnableBusy(true)
    setEnableError('')
    try {
      const practiceData = await generatePractice({ apiKey, title: notebook.title, sources: notebook.sources })
      onSave({ ...notebook, stageEnabled: { ...notebook.stageEnabled, practice: true }, practice: practiceData })
    } catch (e) {
      setEnableError(e.message)
    } finally {
      setEnableBusy(false)
    }
  }

  return (
    <StageGate enabled={enabled} ready={ready} busy={enableBusy} error={enableError} label="Practice" onEnable={enablePractice}>
      <PracticeContent notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={onNeedApiKey} />
    </StageGate>
  )
}

function PracticeContent({ notebook, onSave, apiKey, onNeedApiKey }) {
  const [session, setSession] = useState(null)
  const [summary, setSummary] = useState(null)
  const [problemsOpen, setProblemsOpen] = useState(false)

  const practice = notebook.practice
  if (!practice) {
    return <EmptyHint icon={Brain} title="No practice set yet" body="Generate study materials in Creation to build your question bank." />
  }

  const categories = {
    concepts: practice.concepts || [],
    vocabulary: practice.vocabulary || [],
    people: practice.people || [],
    formulas: practice.formulas || [],
    application: practice.application || [],
  }
  const hasAny = Object.values(categories).some((c) => c.length > 0)

  function startSession(cat) {
    const raw = categories[cat]
    const isTermPool = cat === 'vocabulary' || cat === 'formulas'
    const questions = isTermPool ? deriveMCQ(shuffle(raw)).slice(0, BATCH_SIZE) : shuffle(raw).slice(0, BATCH_SIZE)
    setSession({ category: cat, questions, index: 0, selected: null, submitted: false, correct: 0, attempted: 0 })
  }

  function endSession(finalSession) {
    const s = finalSession || session
    if (s) {
      const stats = notebook.practiceStats || { attempts: 0, correct: 0, history: [] }
      onSave({
        ...notebook,
        practiceStats: {
          attempts: stats.attempts + s.attempted,
          correct: stats.correct + s.correct,
          history: [...(stats.history || []), { date: Date.now(), category: s.category, attempted: s.attempted, correct: s.correct }],
        },
      })
      setSummary({ category: s.category, attempted: s.attempted, correct: s.correct })
    }
    setSession(null)
  }

  if (problemsOpen) return <ProblemsView problems={practice.problems || []} onClose={() => setProblemsOpen(false)} />

  if (summary) {
    const pct = summary.attempted ? Math.round((summary.correct / summary.attempted) * 100) : 0
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white flex items-center justify-center mx-auto text-2xl font-display font-semibold">{pct}%</div>
        <h2 className="font-display text-2xl font-semibold text-slate-900 mt-5">Session complete</h2>
        <p className="text-slate-500 mt-1">
          {summary.correct} of {summary.attempted} correct in {CATEGORY_META[summary.category]?.label}.
        </p>
        <PrimaryButton onClick={() => setSummary(null)} className="mt-6">
          Back to practice
        </PrimaryButton>
      </div>
    )
  }

  if (session) {
    return (
      <PracticeSession
        session={session}
        setSession={setSession}
        onEnd={endSession}
        rawPool={categories[session.category]}
        apiKey={apiKey}
        notebook={notebook}
        onNeedApiKey={onNeedApiKey}
      />
    )
  }

  if (!hasAny) return <EmptyHint icon={Brain} title="No practice set yet" body="Generate study materials in Creation to build your question bank." />

  return (
    <div>
      <h2 className="font-display text-2xl font-semibold text-slate-900">Practice what you've learned</h2>
      <p className="text-slate-500 mt-1">Just you and the question. Submit, take a hint, or skip.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
        {Object.entries(CATEGORY_META).map(([id, meta]) => {
          const count = categories[id].length
          return (
            <button
              key={id}
              disabled={count === 0}
              onClick={() => startSession(id)}
              className={`text-left rounded-2xl border p-5 transition ${count === 0 ? 'border-slate-100 opacity-40 cursor-not-allowed' : 'border-slate-200 bg-white hover:shadow-md hover:-translate-y-0.5'}`}
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.gradient} text-white flex items-center justify-center`}>
                <meta.icon size={18} />
              </div>
              <p className="font-display font-semibold text-slate-900 mt-3">{meta.label}</p>
              <p className="text-sm text-slate-500">{count > 0 ? 'Start a set' : id === 'application' ? "Doesn't apply here" : 'None yet'}</p>
            </button>
          )
        })}
      </div>

      {practice.problems?.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display font-semibold text-lg text-slate-900 mb-1">Solve problems</h3>
          <p className="text-slate-500 text-sm mb-4">
            Work through {practice.problems.length} problem{practice.problems.length === 1 ? '' : 's'} from your notebook, then check your steps.
          </p>
          <button onClick={() => setProblemsOpen(true)} className="w-full text-left rounded-2xl border border-slate-200 bg-white hover:shadow-md hover:-translate-y-0.5 transition p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white flex items-center justify-center shrink-0">
              <Calculator size={20} />
            </div>
            <div>
              <p className="font-display font-semibold text-slate-900">Problem set</p>
              <p className="text-sm text-slate-500">{practice.problems.length} worked problems</p>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

function PracticeSession({ session, setSession, onEnd, rawPool, apiKey, notebook, onNeedApiKey }) {
  const { category, questions, index, selected, submitted, correct, attempted } = session
  const q = questions[index]
  const meta = CATEGORY_META[category]
  const [showHint, setShowHint] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const isTermPool = category === 'vocabulary' || category === 'formulas'
  const showsExplanation = category === 'concepts' || category === 'application' || isTermPool

  function select(i) {
    if (submitted) return
    setSession((s) => ({ ...s, selected: i }))
  }
  function submit() {
    if (selected === null || submitted) return
    const isCorrect = selected === q.answerIndex
    setSession((s) => ({ ...s, submitted: true, correct: s.correct + (isCorrect ? 1 : 0), attempted: s.attempted + 1 }))
  }

  async function advance() {
    setShowHint(false)
    const nextIndex = index + 1
    if (nextIndex < questions.length) {
      setSession((s) => ({ ...s, index: nextIndex, selected: null, submitted: false }))
      return
    }
    // Ran out of loaded questions — fetch (or reshuffle) another batch so the set feels endless.
    if (isTermPool) {
      const more = deriveMCQ(shuffle(rawPool)).slice(0, BATCH_SIZE)
      setSession((s) => ({ ...s, questions: [...s.questions, ...more], index: nextIndex, selected: null, submitted: false }))
      return
    }
    if (!apiKey) {
      onNeedApiKey()
      return
    }
    setLoadingMore(true)
    try {
      const more = await generateMoreQuestions({ apiKey, notebook, category, existingQuestions: questions.map((item) => item.question) })
      if (more.length) {
        setSession((s) => ({ ...s, questions: [...s.questions, ...more], index: nextIndex, selected: null, submitted: false }))
      } else {
        onEnd({ ...session, correct, attempted })
      }
    } catch {
      onEnd({ ...session, correct, attempted })
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-900">Practice what you've learned</h2>
          <p className="text-slate-500 mt-1">
            {meta.label} · question {index + 1} {attempted > 0 && `· ${correct}/${attempted} correct so far`}
          </p>
        </div>
        <button onClick={() => onEnd(session)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition">
          <X size={15} /> End practice
        </button>
      </div>

      <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl p-8">
        {loadingMore ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-3">
            <Spinner size={22} />
            <p className="text-sm">Loading more questions…</p>
          </div>
        ) : (
          <>
            <p className="text-xl font-medium text-slate-900 leading-snug">{q.question}</p>
            <div className="space-y-2.5 mt-6">
              {q.options.map((opt, i) => {
                const isSelected = selected === i
                const isCorrectOpt = i === q.answerIndex
                let cls = 'border-slate-200 hover:border-slate-300'
                if (submitted) {
                  if (isCorrectOpt) cls = 'border-emerald-400 bg-emerald-50'
                  else if (isSelected) cls = 'border-rose-300 bg-rose-50'
                } else if (isSelected) cls = 'border-blue-500 bg-blue-50/60'
                return (
                  <button key={i} onClick={() => select(i)} disabled={submitted} className={`w-full text-left flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 transition ${cls}`}>
                    <span className="text-slate-800">{opt}</span>
                    {submitted && isCorrectOpt && <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />}
                    {submitted && isSelected && !isCorrectOpt && <XCircle size={18} className="text-rose-500 shrink-0" />}
                    {!submitted && isSelected && <span className="w-4 h-4 rounded-full border-2 border-blue-500 bg-blue-500 shrink-0" />}
                  </button>
                )
              })}
            </div>

            {showHint && !submitted && q.hint && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-2.5 mt-4 flex items-start gap-1.5">
                <Lightbulb size={14} className="mt-0.5 shrink-0" /> {q.hint}
              </p>
            )}
            {submitted && showsExplanation && q.explanation && (
              <p className="text-sm text-blue-800 bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5 mt-4">{q.explanation}</p>
            )}

            <div className="flex items-center gap-2 mt-6">
              {!submitted ? (
                <>
                  <PrimaryButton onClick={submit} disabled={selected === null}>
                    Submit answer
                  </PrimaryButton>
                  <SecondaryButton onClick={() => setShowHint((v) => !v)}>
                    <Lightbulb size={14} /> Hint
                  </SecondaryButton>
                  <SecondaryButton onClick={advance}>
                    <SkipForward size={14} /> Skip
                  </SecondaryButton>
                </>
              ) : (
                <PrimaryButton onClick={advance}>Next question</PrimaryButton>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ProblemsView({ problems, onClose }) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  if (!problems.length) return <EmptyHint icon={Calculator} title="No problems yet" body="This notebook doesn't have solvable problems." action={<SecondaryButton onClick={onClose}>Back</SecondaryButton>} />
  const p = problems[index]

  return (
    <div>
      <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5 transition">
        <X size={15} /> Back to practice
      </button>
      <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl p-8">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
          Problem {index + 1} of {problems.length}
        </p>
        <p className="text-lg text-slate-900 leading-relaxed">{p.prompt}</p>
        {revealed ? (
          <div className="mt-6 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-emerald-800 mb-1.5">Solution: {p.solution}</p>
            {p.workedSteps && <p className="text-sm text-emerald-700 leading-relaxed whitespace-pre-line">{p.workedSteps}</p>}
          </div>
        ) : (
          <SecondaryButton onClick={() => setRevealed(true)} className="mt-6">
            <Eye size={14} /> Show solution
          </SecondaryButton>
        )}
        <div className="flex gap-2 mt-6">
          <SecondaryButton
            disabled={index === 0}
            onClick={() => {
              setIndex((i) => i - 1)
              setRevealed(false)
            }}
          >
            Previous
          </SecondaryButton>
          <PrimaryButton
            disabled={index >= problems.length - 1}
            onClick={() => {
              setIndex((i) => i + 1)
              setRevealed(false)
            }}
          >
            Next problem
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
