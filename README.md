# StreamForge CLI

Modern, dark-themed developer utility that converts messy browser DevTools network dumps, HLS segment URLs (`.ts` / `.tsm` / `.m3u8`), and `cURL` commands into high-speed CLI download commands for `yt-dlp`, `aria2c`, and `N_m3u8DL-RE`.

## Architecture

- **Frontend:** React (Vite) + Tailwind CSS + Lucide React
- **Backend:** Vercel Serverless Function (`/api/parse.js`) powered by Groq (`llama-3.3-70b-versatile`) with strict JSON mode (`response_format: { type: "json_object" }`)
- **Hybrid Parsing Engine:**
  1. **Instant Local Regex Mode (0ms):** Live client-side parsing for Wistia delivery hashes, `.m3u8`/`.mpd` streams, `.ts`/`.tsm` segment stripping, DevTools garbage cleaning, and `cURL` header extraction.
  2. **AI Smart Extract (`/api/parse`):** Sends messy multi-line DevTools logs or cURL commands to Groq for intelligent stream URL, header, and `--referer` extraction.

## Local Development

```bash
npm install
cp .env.example .env.local
# Add your GROQ_API_KEY in .env.local
npm run dev
```

Vite's built-in local API middleware automatically serves `/api/parse` via `api/parse.js` during `npm run dev` and `npm run preview`.

## Deploy to Vercel

1. Push this repository to GitHub / GitLab / Bitbucket or run `vercel`.
2. In **Vercel Project Settings → Environment Variables**, add:
   - `GROQ_API_KEY`: Your Groq API key (`gsk_...`)
3. Deploy — Vercel automatically builds the Vite frontend and mounts `/api/parse.js` as a Serverless Function.
