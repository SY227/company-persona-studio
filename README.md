# House Voice

House Voice is a local Next.js prototype for turning company PDFs and pasted material into a premium, session-based grounded company chat experience.

It is intentionally scoped as a fast session-based prototype:
- upload PDFs
- paste writing samples
- distill a company persona from the material
- launch a grounded company chat with visible source backing
- optionally try a polished sample company instantly

This is **not** a production multi-tenant chatbot platform.

## Stack

- Next.js 16
- TypeScript
- Tailwind CSS 4
- Gemini 2.5 Flash Lite for live synthesis and chat when configured
- Local fallback mode when no Gemini API key is present
- Lightweight PDF extraction with `pdf-parse`

## What it does

1. Accepts PDF uploads and pasted writing
2. Extracts text and builds lightweight source chunks
3. Synthesizes a persona profile with:
   - company persona summary
   - key traits
   - knowledge domains
   - tone descriptors
   - writing directives
4. Uses that persona plus retrieved chunks to answer chat questions
5. Shows lightweight source grounding below assistant replies
6. Preserves reply-level live or fallback mode so chat failures are visible during testing
7. Includes a built-in sample company so the demo works immediately

## Run locally

```bash
npm install
npm run dev
```

Then open:

```bash
http://localhost:3000
```

## Gemini setup

Create `.env.local` in the project root:

```bash
cp .env.example .env.local
```

Then add one of these:

```env
GEMINI_API_KEY=your_key_here
# or
GOOGLE_API_KEY=your_key_here
# or
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```

If no key is present, the app still runs in a local demo fallback mode so the product flow stays testable.

## Demo notes

- The app is session-based only.
- There is no database, auth system, or persistent user account model.
- Uploaded text is processed for the current live demo flow.
- Resetting the session clears the current in-browser demo state.
- If Gemini is configured, source excerpts are sent to the model to synthesize the persona and generate replies.
- Assistant replies now carry their own mode badge so you can tell whether a given answer came from live Gemini or the fallback path.

## Main files

- `src/components/house-voice-app.tsx` - main UI and interaction flow
- `src/app/api/intake/route.ts` - upload intake, text extraction, persona synthesis
- `src/app/api/chat/route.ts` - grounded answer generation
- `src/lib/sample-company.ts` - built-in sample data
- `src/lib/text.ts` - chunking and lightweight retrieval
- `src/lib/gemini.ts` - Gemini request helper
- `src/lib/fallback.ts` - local fallback synthesis and answering

## Quality bar checklist

- Value is obvious quickly from the hero and materials flow
- The chat experience is the main payoff after synthesis
- Sample path stays optional and secondary
- Messaging stays truthful about what the system is doing
- Chat feels grounded through visible, quiet source references
