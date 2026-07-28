# Noted

Turn anything you study into a lecture, notes, and practice.

Noted is an AI-powered study app built around a 5-stage active-recall pipeline: **Creation → Learning → Practice → Chat → Teach**. Upload your notes, slides, photos, video, audio, websites, or YouTube links, and Noted generates a narrated lecture with real illustrations, exhaustive per-topic notes you can browse and edit, a mindmap/timeline/chart/diagrams (all editable), an ever-growing practice question bank, a grounded tutor chat, and a Feynman-technique "teach it back" mode with live coaching — plus foldable double-sided study sheets, a focus timer with real music, and full profile customization.

It works two ways:
- **Local-only (default, zero setup):** everything lives in this browser via `localStorage`. Free forever, works offline, nothing to configure.
- **Cloud-synced (optional):** connect your own free Firebase project and get real accounts, cross-device sync, and notebook sharing via a short code. See [Cross-device sync with Firebase](#cross-device-sync-with-firebase) below.

## Tech stack

- **React 19** + **Vite** — frontend framework and build tool
- **Tailwind CSS v4** — styling
- **lucide-react** — icons
- **@google/genai** — Gemini API SDK (student supplies their own free API key); used for text generation, native text-to-speech, image generation, and audio/video transcription via the Files API
- **Firebase** (optional) — Authentication + Firestore + Storage for cross-device sync and sharing; lazy-loaded, so it never even downloads for anyone running local-only
- **pdfjs-dist** — client-side PDF text extraction
- **Web Speech API** — dictation in Chat, live transcription in Teach, and a narration fallback if Gemini audio can't be generated
- **Web Audio API** + **YouTube IFrame API** — the focus timer's ambient sound: real chord-based lofi streamed from YouTube (with an offline synthesized fallback), actual rain droplets, forest, and white noise, all procedurally generated
- A tiny hand-rolled **Service Worker** for offline/PWA support

## 1. Run it locally

You need [Node.js](https://nodejs.org) **20.19+** (or 22.12+) installed.

```bash
# unzip the project, then from inside the noted/ folder:
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). Sign up with any name/email/password (stored locally, just gating the demo — or see the Firebase section below for real accounts), and you're in.

Other useful commands:

```bash
npm run build     # production build, output in dist/
npm run preview   # serve the production build locally to double-check it
```

## 2. Get a free Gemini API key

The AI generation calls Google's Gemini API directly from your browser using a key you provide — nothing goes through a server of ours.

1. Go to **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)** and sign in with a Google account.
2. Click **Create API key** (it's free — Gemini has a generous free tier, and Noted automatically spaces out requests to stay under free-tier rate limits).
3. In Noted, click your avatar (top right) → paste the key under **Gemini API key** → **Save changes**.

## 3. Push it to GitHub

```bash
cd noted
git init
git add .
git commit -m "Noted: AI study platform"
```

Create a new empty repository on [github.com/new](https://github.com/new), then:

```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

## 4. Host it for free on Firebase

Firebase Hosting's free **Spark plan** is genuinely free (no credit card required) and gives you HTTPS, a global CDN, and a `.web.app` URL.

1. **Create a Firebase project** — [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. **Install the CLI** (one-time): `npm install -g firebase-tools`
3. **Log in:** `firebase login`
4. **Initialize Hosting** from inside `noted/`: `firebase init hosting`
   - *Use an existing project* → pick your project
   - *Public directory* → type **`dist`**
   - *Configure as a single-page app* → **Yes**
   - *Set up automatic builds with GitHub* → **No** is simplest
5. **Build and deploy:**
   ```bash
   npm run build
   firebase deploy --only hosting
   ```
   Add a shortcut: `npm pkg set scripts.deploy="npm run build && firebase deploy --only hosting"`, then just `npm run deploy` from now on.
6. Firebase prints your live URL — something like `https://your-project.web.app`.

**Other free options** (identical either way, since there's no required backend): **Vercel** (auto-detects Vite, zero config), **Netlify** (build `npm run build`, publish `dist`), **GitHub Pages** (add `base: '/<repo-name>/'` to `vite.config.js`, then `gh-pages -d dist`).

## Cross-device sync with Firebase

By default Noted is entirely local-only. If you want real accounts and to access your notebooks from any device or browser — plus notebook sharing via a code — connect the *same* Firebase project you're already hosting on to two more Firebase products: **Authentication** and **Firestore** (both free on the Spark plan, no card required). This is genuinely optional; skip this section and everything keeps working exactly as it does now, just local to each browser.

1. **Enable Authentication.** In the Firebase console: **Build → Authentication → Get started → Sign-in method → Email/Password → Enable**.
2. **Enable Firestore.** **Build → Firestore Database → Create database** → start in **production mode** (the rules below lock it down properly) → pick a location close to your users.
3. **Enable Storage.** **Build → Storage → Get started**. Generated illustrations and photos are uploaded here (Firestore documents cap out at 1MB, which base64 images blow past fast) — the app handles this automatically.
4. **Publish the security rules.** This repo includes `firestore.rules` — apply it with:
   ```bash
   firebase init firestore   # if you haven't already; point it at firestore.rules when asked
   firebase deploy --only firestore:rules
   ```
   These rules make sure each user can only read/write their own data, and that shared notebooks are readable by anyone with the code but only writable by a signed-in user.
5. **Register a web app** in the Firebase console (**Project settings → General → Your apps → </> Add app**), then copy its config values.
6. **Add the config to Noted:**
   ```bash
   cp .env.example .env
   ```
   and fill in the six `VITE_FIREBASE_*` values from step 5.
7. **Rebuild and redeploy:** `npm run build && firebase deploy --only hosting`.

That's it — the app detects the config automatically. Sign-up now creates a real Firebase account, notebooks sync in real time across every device you sign into, and a **Share** button appears in each generated notebook's header (generates a 6-character code; anyone can redeem it from the dashboard's **Redeem code** button to get their own copy of your Creation sources and Learning content — their practice history, chat, and teach sessions always stay separate and never transfer).

If you ever want to go back to local-only, just delete or empty `.env` and rebuild.

## How the 5 stages work

1. **Creation** — drag in slides, PDFs, photos (real camera access), video, audio, website links, or YouTube videos, or paste text. Audio and video are transcribed via Gemini's Files API in the background as soon as you add them (or at generate-time if you add your key later) — genuinely large files just work, since nothing is chunked or re-encoded client-side; a file only shows "not indexed" if transcription itself fails. Every source is viewable and renameable inline. A **Customize** button lets you pick exactly which of Video Lecture / Notes / Specials / Practice / Chat / Teach to generate up front — anything you skip stays locked until you open it, at which point it generates on the spot with its own loading state.
2. **Learning** — Gemini writes a lecture script narrated with native Gemini text-to-speech (male voice by default, browser narration as an automatic fallback) through a real player: adjustable speed, drag-to-scrub, tap either side to jump ±10s, fullscreen, YouTube-style auto-hiding controls. "Generate visuals" adds a few illustrations and small keyword-triggered animations on demand. **Notes** are generated one topic at a time (so nothing gets compressed to fit a shared budget), browsable from a sidebar, and fully editable. **Specials** — outline (with each topic's main idea, editable), a mindmap you expand level-by-level by clicking branches, timeline, chart, flow diagrams with real illustrations, a **Custom** generator (slide deck with subject-themed backgrounds, flashcards with a "go through all cards" mode, infographic, or report — describe your own too), and **Study Sheets**: pages generate to fit your material (however many that takes), with a foldable flashcard edge sized to your vocabulary (fold on the dotted line — no cutting) and short hierarchical bullets that fill each page at a comfortable, fixed size. Every special is editable.
3. **Practice** — Concepts, Vocabulary, People, Formulas, and (for quantitative subjects) **Application** — real-world/word-problem-style questions — each with post-answer explanations, plus a "solve problems" mode for math/science notebooks. Sets never run out: once you clear a batch, more load automatically.
4. **Chat** — a tutor grounded only in your notebook, dictation support, Shift+Enter for multi-line questions, and on-demand targeted practice (with explanations) on whatever you just discussed.
5. **Teach** — explain the material by speaking or typing (Silent mode), sketch on the whiteboard or type in the Doc panel (a segmented control, not a dropdown, so you never lose work switching), and get live coaching on topics still to cover and specific factual/completeness feedback. "Check my progress" saves feedback so "Finish" only evaluates what's new since. Reset clears the whole session; a toolbar button clears just the board.

Notebooks you **star** are pinned to their own tab and confirmed available offline. A global **Study session** button (bottom-right, always available once signed in) gives you a focus timer — 15/30/45/60/custom presets, a finishing chime, real music (Lofi Girl's radio via YouTube, with an offline synthesized fallback; rain, forest, and white noise are fully synthesized and work offline) — and an optional fullscreen lock for the duration of your timer (or indefinitely), with a confirmation before it lets you out early.

Every Gemini call is spaced out through a shared request queue so a single free-tier API key doesn't get rate-limited when several requests fire in a row.

## Security notes

- **Local-only mode:** accounts are a local stand-in for real auth — fine for a demo, not for production. See the Firebase section above for real ones.
- **Cloud mode:** Firestore security rules (in `firestore.rules`) restrict every user to their own data; shared notebooks are deliberately public-read (that's the feature) but only a signed-in user can publish one.
- Because the Gemini API is called directly from the browser, your API key is visible in network requests from your own machine. That's expected for a personally-keyed app like this one — don't reuse a key you care about protecting, and don't put this pattern in front of untrusted users without a backend proxy that holds the key server-side instead.

## Known limitations

- `.pptx`/`.docx` files are accepted as sources but their text isn't extracted automatically — paste the text you want included instead (PDFs, images, audio, video, websites, and YouTube links all work natively).
- Speech recognition (Teach's "Speak", Chat's dictation) has the best support in Chrome and Edge; other browsers should use Silent mode / typing instead.
- The Lofi music option needs an internet connection (it streams from YouTube); every other ambient sound option is fully offline.
- Extremely large notebooks (many long topics) could in principle exceed Firestore's 1MB document limit in cloud mode — images are already offloaded to Storage to avoid this, and the app surfaces a clear message rather than failing silently if it ever happens.
- Study Sheets' fold-to-reveal flashcard edge assumes standard double-sided ("long edge") duplex printing, which you choose in your print dialog — the app never forces duplex, it just outputs pages in the right order for it.

## For your Congressional App Challenge submission

You'll typically need a short demo video, your source code (this repo), and a written description. Worth highlighting: the pipeline maps each stage to a specific learning-science technique (active recall in Practice, retrieval + spaced check-ins in Learning, the Feynman technique in Teach), the app works fully offline once loaded, and — if you set up the optional Firebase layer — it demonstrates real cross-device sync and peer sharing, which is a nice technical depth signal for judges.
