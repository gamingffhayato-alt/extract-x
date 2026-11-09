/**
 * StreamForge CLI — Vercel Serverless Function (/api/parse.js)
 * Uses Groq Chat Completions (llama-3.3-70b-versatile) with JSON mode
 * to parse messy DevTools network dumps, HLS segment URLs, and cURL commands.
 */

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function normalizeFolderPath(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') return '';
  let clean = folderPath.trim().replace(/^["']+|["']+$/g, '');
  if (!clean) return '';
  clean = clean.replace(/\\/g, '/');
  clean = clean.replace(/\/{2,}/g, (match, offset) => (offset === 0 ? '//' : '/'));
  if (clean.length > 1 && !/^[a-zA-Z]:\/$/.test(clean)) {
    clean = clean.replace(/\/+$/, '');
  }
  return clean;
}

function normalizeFileName(fileName, fallback = 'video_1.mp4') {
  const raw = typeof fileName === 'string' ? fileName.trim() : '';
  const candidate = raw || fallback;
  const baseOnly = candidate.replace(/\\/g, '/').split('/').pop() || fallback;
  let sanitized = baseOnly.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  if (!sanitized) sanitized = fallback;
  if (!/\.mp4$/i.test(sanitized)) {
    sanitized = sanitized.replace(/\.(ts|tsm|m3u8|mkv|webm|bin)$/i, '') + '.mp4';
  }
  return sanitized;
}

function escapeDoubleQuotes(value) {
  return String(value).replace(/"/g, '\\"');
}

function stripSegmentSuffix(url) {
  if (!url || typeof url !== 'string') return '';
  let clean = url
    .trim()
    .replace(/^["'`<(]+/, '')
    .replace(/["'`>,;)]+$/, '')
    .replace(/\s+(?:Request\s+method|Status\s+Code|Remote\s+Address).*$/i, '');

  const qIdx = clean.indexOf('?');
  const base = qIdx !== -1 ? clean.slice(0, qIdx) : clean;
  const query = qIdx !== -1 ? clean.slice(qIdx) : '';

  const strippedBase = base
    .replace(/\/(?:seg|segment|chunk|frag|part|media)[-_]?[a-z0-9_-]*\.(?:ts|tsm|m4s|aac)(?=$)/i, '')
    .replace(/\/[a-z0-9_-]*-\d+-v\d+-a\d+\.(?:ts|tsm)(?=$)/i, '')
    .replace(/\/+$/, '');

  if (
    query &&
    (base.includes('.m3u8') ||
      base.includes('.mpd') ||
      /(token|hdnea|exp|expires|sig|signature|policy|auth|key)/i.test(query))
  ) {
    return `${strippedBase}${query}`;
  }
  return strippedBase;
}

function buildCanonicalCommands({
  m3u8Url,
  binUrl,
  folderPath,
  fileName,
  threads,
  referer,
  extraHeaders = [],
}) {
  if (!m3u8Url) {
    return {
      ytdlp_m3u8: '',
      ytdlp_bin: null,
      aria2c_bin: null,
      ytdlp_aria2c: '',
    };
  }

  const folderFlagYtdlp = folderPath ? ` -P "${escapeDoubleQuotes(folderPath)}"` : '';
  const folderFlagAria = folderPath ? ` -d "${escapeDoubleQuotes(folderPath)}"` : '';
  const refererFlagYtdlp = referer ? ` --referer "${escapeDoubleQuotes(referer)}"` : '';
  const refererFlagAria = referer ? ` --referer="${escapeDoubleQuotes(referer)}"` : '';

  const extraYtdlp = extraHeaders
    .map((h) => ` --add-header "${escapeDoubleQuotes(h)}"`)
    .join('');
  const extraAria = extraHeaders
    .map((h) => ` --header="${escapeDoubleQuotes(h)}"`)
    .join('');

  const safeM3u8 = escapeDoubleQuotes(m3u8Url);
  const safeFile = escapeDoubleQuotes(fileName);

  const ytdlp_m3u8 = `yt-dlp -N ${threads}${refererFlagYtdlp}${extraYtdlp} "${safeM3u8}"${folderFlagYtdlp} -o "${safeFile}"`;
  const ytdlp_aria2c = `yt-dlp --downloader aria2c --downloader-args "aria2c:-x ${threads} -s ${threads} -k 1M"${refererFlagYtdlp}${extraYtdlp} "${safeM3u8}"${folderFlagYtdlp} -o "${safeFile}"`;

  let ytdlp_bin = null;
  let aria2c_bin = null;

  if (binUrl) {
    const safeBin = escapeDoubleQuotes(binUrl);
    ytdlp_bin = `yt-dlp -N ${threads}${refererFlagYtdlp}${extraYtdlp} "${safeBin}"${folderFlagYtdlp} -o "${safeFile}"`;
    aria2c_bin = `aria2c -x ${threads} -s ${threads} -k 1M${refererFlagAria}${extraAria} "${safeBin}"${folderFlagAria} -o "${safeFile}"`;
  }

  return {
    ytdlp_m3u8,
    ytdlp_bin,
    aria2c_bin,
    ytdlp_aria2c,
  };
}

function buildSystemPrompt() {
  return `You are a CLI stream parser expert. Extract the base video stream URL (.m3u8, .mpd, or Wistia delivery hash) and any Referer/Origin/Cookie headers from the user's messy DevTools network dump or cURL text. Strip any \`/seg-...ts\` or \`.tsm\` segment paths and trailing text like \`Request method GET\`.

Enforce these transformation rules strictly:
1. Dirty Input Cleaning: Strip trailing Chrome DevTools artifacts (e.g., "Request method GET", spaces, status codes, headers) and segment suffixes like "/seg-247-v1-a1.ts" or "/seg-38-v1-a1.tsm".
2. Wistia Detection: If the URL matches "embed-cloudfront.wistia.com/deliveries/[HASH]...":
   - provider = "wistia"
   - hash = "[HASH]"
   - m3u8Url = "https://embed-cloudfront.wistia.com/deliveries/[HASH].m3u8"
   - binUrl = "https://embed-cloudfront.wistia.com/deliveries/[HASH].bin"
3. Custom Save Path & Filename:
   - Normalize Windows backslashes "\\" to forward slashes "/" in folder paths (e.g., "D:/Lectures").
   - For yt-dlp: use -P "<folder_path>" (when folder is non-empty) and -o "<filename>.mp4".
   - For aria2c: use -d "<folder_path>" (when folder is non-empty) and -o "<filename>.mp4" strictly for the filename (never put directory paths inside -o for aria2c).
4. High-Speed Command Templates (include --referer "<referer>" if a referer is present, and --add-header for Origin/Cookie if needed):
   - ytdlp_m3u8: yt-dlp -N <threads> "<m3u8_url>" -P "<folder>" -o "<filename>.mp4"
   - ytdlp_bin (null if not Wistia): yt-dlp -N <threads> "<bin_url>" -P "<folder>" -o "<filename>.mp4"
   - aria2c_bin (null if not Wistia): aria2c -x <threads> -s <threads> -k 1M "<bin_url>" -d "<folder>" -o "<filename>.mp4"
   - ytdlp_aria2c: yt-dlp --downloader aria2c --downloader-args "aria2c:-x <threads> -s <threads> -k 1M" "<m3u8_url>" -P "<folder>" -o "<filename>.mp4"

Return ONLY valid JSON matching this schema:
{
  "provider": "wistia" | "generic_hls" | "unknown",
  "hash": "string or null",
  "m3u8Url": "string",
  "binUrl": "string or null",
  "referer": "string or null",
  "commands": {
    "ytdlp_m3u8": "string",
    "ytdlp_bin": "string or null",
    "aria2c_bin": "string or null",
    "ytdlp_aria2c": "string"
  },
  "explanation": "1-sentence summary of what was cleaned"
}`;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      code: 'MISSING_API_KEY',
      error:
        'GROQ_API_KEY is not configured in environment variables. Add GROQ_API_KEY in Vercel Project Settings (or .env.local for local dev) to enable AI Smart Extract.',
    });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const rawInput = typeof body.rawInput === 'string' ? body.rawInput.trim() : '';
  const folderPath = normalizeFolderPath(
    typeof body.folderPath === 'string' ? body.folderPath : 'D:/Lectures'
  );
  const fileName = normalizeFileName(
    typeof body.fileName === 'string' ? body.fileName : 'video_1.mp4'
  );
  const threads = [8, 16, 32].includes(Number(body.threads)) ? Number(body.threads) : 16;
  const userReferer =
    typeof body.referer === 'string' && body.referer.trim() ? body.referer.trim() : null;

  if (!rawInput) {
    return res.status(400).json({
      code: 'EMPTY_INPUT',
      error: 'rawInput is required and cannot be empty.',
    });
  }

  if (rawInput.length > 32000) {
    return res.status(400).json({
      code: 'INPUT_TOO_LARGE',
      error: 'rawInput exceeds maximum length of 32,000 characters.',
    });
  }

  try {
    const groqResponse = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(),
          },
          {
            role: 'user',
            content: JSON.stringify({
              rawInput,
              folderPath,
              fileName,
              threads,
              referer: userReferer,
            }),
          },
        ],
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      return res.status(groqResponse.status >= 500 ? 502 : groqResponse.status).json({
        code: 'GROQ_API_ERROR',
        error: `Groq API error (${groqResponse.status}): ${errText.slice(0, 300)}`,
      });
    }

    const completion = await groqResponse.json();
    const content = completion?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({
        code: 'EMPTY_GROQ_RESPONSE',
        error: 'Groq returned an empty completion payload.',
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return res.status(502).json({
        code: 'INVALID_GROQ_JSON',
        error: 'Groq returned malformed JSON.',
      });
    }

    // Deterministic post-normalization to guarantee 100% adherence to Core Rules 1-4
    let m3u8Url = stripSegmentSuffix(parsed.m3u8Url || '');
    let binUrl = parsed.binUrl ? String(parsed.binUrl).trim() : null;
    let hash = parsed.hash ? String(parsed.hash).trim() : null;
    let provider = ['wistia', 'generic_hls', 'unknown'].includes(parsed.provider)
      ? parsed.provider
      : 'unknown';

    const wistiaCheck = (m3u8Url || rawInput).match(
      /embed-cloudfront\.wistia\.com\/deliveries\/([a-zA-Z0-9_-]+)/i
    );
    if (wistiaCheck) {
      hash = wistiaCheck[1];
      provider = 'wistia';
      m3u8Url = `https://embed-cloudfront.wistia.com/deliveries/${hash}.m3u8`;
      binUrl = `https://embed-cloudfront.wistia.com/deliveries/${hash}.bin`;
    } else if (m3u8Url && provider === 'unknown') {
      provider = 'generic_hls';
    }

    const extractedReferer =
      userReferer ||
      (typeof parsed.referer === 'string' && parsed.referer.trim() ? parsed.referer.trim() : null);

    // Extract any --add-header flags Groq might have found for Origin/Cookie preservation
    const extraHeaders = [];
    const sampleCmd = parsed?.commands?.ytdlp_m3u8 || '';
    const headerFlagRegex = /--add-header\s+"([^"]+)"/gi;
    let hMatch;
    while ((hMatch = headerFlagRegex.exec(sampleCmd)) !== null) {
      const hVal = hMatch[1].trim();
      if (hVal && !/^referer\s*:/i.test(hVal)) {
        extraHeaders.push(hVal);
      }
    }

    const commands = buildCanonicalCommands({
      m3u8Url,
      binUrl,
      folderPath,
      fileName,
      threads,
      referer: extractedReferer,
      extraHeaders,
    });

    return res.status(200).json({
      provider,
      hash,
      m3u8Url,
      binUrl,
      referer: extractedReferer,
      commands,
      explanation:
        typeof parsed.explanation === 'string' && parsed.explanation.trim()
          ? parsed.explanation.trim()
          : m3u8Url
          ? 'Extracted and normalized stream URL and high-speed CLI commands.'
          : 'Could not locate a valid stream URL in the provided input.',
    });
  } catch (err) {
    return res.status(500).json({
      code: 'SERVER_ERROR',
      error: err instanceof Error ? err.message : 'Unexpected server error',
    });
  }
}
