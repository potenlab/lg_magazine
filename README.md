# Magazine STORY · Vision Express

LG 비전 익스프레스 v3 — 한 사람을 위한 단 한 호의 매거진.

## Stack

- Next.js 16.2.3 (App Router, Turbopack)
- React 19, TypeScript 5
- framer-motion, @react-pdf/renderer
- Tailwind v4
- Anthropic / OpenAI / Gemini provider switch (`LLM_PROVIDER` env)
- Supabase REST API for `v3_sessions` table

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

App routes to `/v3`. Root `/` redirects.

## Env

See `.env.example`. At minimum:
- `LLM_PROVIDER` + matching `*_API_KEY`
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`

## DB

Run `supabase/migrations/v3_sessions.sql` once on your Supabase project.

## Layout

```
src/
  app/v3            — page entry + layout
  app/api/v3        — /llm and /sessions routes
  components/v3     — scenes, ui, context
  lib/v3            — scenes spec, llm, pdf, session storage
  lib/llm           — provider abstraction (anthropic/openai/gemini/aistudio)
  lib/llmInput.ts   — input length caps
  concepts          — owl persona + pose mapping
public/
  vision_express    — bg images, owl poses, audio
  fonts/v3          — Noto Serif KR + Pretendard
```
