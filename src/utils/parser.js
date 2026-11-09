/**
 * StreamForge CLI — Client-side 0ms Regex Parser & Command Builder
 * Enforces all Core Transformation Rules cleanly and deterministically.
 */

export const SAMPLE_PRESETS = [
  {
    id: 'wistia-devtools',
    label: 'Wistia + DevTools Dump',
    badge: 'Wistia',
    input: `Request URL: https://embed-cloudfront.wistia.com/deliveries/8f4c2a1e9b7d6c5f4a3b2c1d0e9f8a7b6c5d4e3f.m3u8/seg-247-v1-a1.ts Request method GET
Status Code: 200 OK
Remote Address: 108.156.14.92:443
Referrer Policy: strict-origin-when-cross-origin`,
  },
  {
    id: 'wistia-tsm',
    label: 'Wistia .tsm Segment',
    badge: 'Wistia .tsm',
    input:
      'https://embed-cloudfront.wistia.com/deliveries/a91b2c3d4e5f60718293a4b5c6d7e8f901234567/seg-38-v1-a1.tsm',
  },
  {
    id: 'curl-hls',
    label: 'cURL + Referer & Headers',
    badge: 'cURL',
    input: `curl 'https://cdn.academy-stream.io/courses/ml-bootcamp/mod-04/1080p/master.m3u8/seg-12-v1-a1.ts?token=eyJhbGciOiJIUzI1NiJ9' \\
  -H 'accept: */*' \\
  -H 'origin: https://academy-stream.io' \\
  -H 'referer: https://academy-stream.io/watch/module-4' \\
  -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'`,
  },
];

/**
 * Normalize folder path: convert Windows backslashes to forward slashes,
 * strip surrounding quotes, and trim trailing slash (keeping root like "/" or "D:/").
 */
export function normalizeFolderPath(folderPath) {
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

/**
 * Normalize filename: strip any directory path (crucial for aria2c -o),
 * sanitize illegal filesystem characters, and ensure .mp4 extension.
 */
export function normalizeFileName(fileName, fallback = 'video_1.mp4') {
  const raw = typeof fileName === 'string' ? fileName.trim() : '';
  const candidate = raw || fallback;
  // Strip any accidental folder paths so aria2c -o strictly receives filename only
  const baseOnly = candidate.replace(/\\/g, '/').split('/').pop() || fallback;
  // Strip illegal path characters
  let sanitized = baseOnly.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  if (!sanitized) sanitized = fallback;
  if (!/\.mp4$/i.test(sanitized)) {
    // Replace other common video extensions or append .mp4
    sanitized = sanitized.replace(/\.(ts|tsm|m3u8|mkv|webm|bin)$/i, '') + '.mp4';
  }
  return sanitized;
}

/**
 * Return filename stem without .mp4 (used by N_m3u8DL-RE --save-name).
 */
export function getFileStem(fileName) {
  return normalizeFileName(fileName).replace(/\.mp4$/i, '');
}

/**
 * Auto-increment filename:
 * video_1.mp4 -> video_2.mp4
 * lecture_09.mp4 -> lecture_10.mp4
 * recording.mp4 -> recording_2.mp4
 */
export function incrementFileName(fileName) {
  const normalized = normalizeFileName(fileName);
  const stem = normalized.replace(/\.mp4$/i, '');
  const match = stem.match(/^(.*?)(\d+)$/);
  if (match) {
    const [, prefix, numStr] = match;
    const nextNum = parseInt(numStr, 10) + 1;
    const padded = String(nextNum).padStart(numStr.length, '0');
    return `${prefix}${padded}.mp4`;
  }
  return `${stem}_2.mp4`;
}

/**
 * Escape double quotes inside shell double-quoted arguments.
 */
function escapeShellDoubleQuotes(value) {
  return String(value).replace(/"/g, '\\"');
}

/**
 * Pre-clean Windows CMD cURL caret escapes and line continuations.
 */
function preprocessRawDump(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  return rawInput
    .replace(/\r\n/g, '\n')
    // Windows CMD line continuation `^` at end of line
    .replace(/\^\s*\n/g, ' ')
    // Bash line continuation `\` at end of line
    .replace(/\\\s*\n/g, ' ')
    // Windows CMD caret-escaped quotes & symbols
    .replace(/\^([&|<>^"%!])/g, '$1');
}

/**
 * Extract headers (Referer, Origin, Cookie, User-Agent, Authorization)
 * from cURL commands or Chrome DevTools Network header blocks.
 */
export function extractHeadersFromInput(rawInput) {
  const text = preprocessRawDump(rawInput);
  const headers = {};

  // 1. cURL -H / --header flags (single or double quoted)
  const curlHeaderRegex =
    /(?:-H|--header)\s+(?:'([^']+)'|"([^"]+)")/gi;
  let match;
  while ((match = curlHeaderRegex.exec(text)) !== null) {
    const headerLine = (match[1] || match[2] || '').trim();
    const colonIdx = headerLine.indexOf(':');
    if (colonIdx > 0) {
      const key = headerLine.slice(0, colonIdx).trim().toLowerCase();
      const val = headerLine.slice(colonIdx + 1).trim();
      if (val) headers[key] = val;
    }
  }

  // 2. cURL --referer / -e and -A / --user-agent and -b / --cookie
  const refererFlagMatch = text.match(/(?:--referer|-e)\s+(?:'([^']+)'|"([^"]+)"|(\S+))/i);
  if (refererFlagMatch) {
    headers.referer = (refererFlagMatch[1] || refererFlagMatch[2] || refererFlagMatch[3] || '').trim();
  }
  const uaFlagMatch = text.match(/(?:--user-agent|-A)\s+(?:'([^']+)'|"([^"]+)")/i);
  if (uaFlagMatch) {
    headers['user-agent'] = (uaFlagMatch[1] || uaFlagMatch[2] || '').trim();
  }
  const cookieFlagMatch = text.match(/(?:--cookie|-b)\s+(?:'([^']+)'|"([^"]+)")/i);
  if (cookieFlagMatch) {
    headers.cookie = (cookieFlagMatch[1] || cookieFlagMatch[2] || '').trim();
  }

  // 3. Raw DevTools header lines (e.g. "referer: https://..." or "Origin: https://...")
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    const lineMatch = trimmed.match(
      /^(referer|referrer|origin|cookie|authorization|user-agent)\s*:\s*(.+)$/i
    );
    if (lineMatch) {
      const rawKey = lineMatch[1].toLowerCase();
      const key = rawKey === 'referrer' ? 'referer' : rawKey;
      const val = lineMatch[2].trim().replace(/^["']|["']$/g, '');
      if (val && !headers[key]) {
        headers[key] = val;
      }
    }
  }

  const extraHeaders = {};
  for (const key of ['origin', 'cookie', 'authorization', 'user-agent']) {
    if (headers[key]) {
      extraHeaders[key] = headers[key];
    }
  }

  return {
    referer: headers.referer || null,
    extraHeaders,
  };
}

/**
 * Strip DevTools trailing garbage and segment suffixes (/seg-247-v1-a1.ts, /seg-38-v1-a1.tsm, etc.)
 * from an extracted URL candidate.
 */
export function cleanStreamUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = rawUrl.trim();

  // Strip surrounding quotes/brackets
  url = url.replace(/^["'`<(]+/, '').replace(/["'`>,;)]+$/, '');

  // Strip trailing DevTools text if somehow attached without space or after whitespace
  url = url.replace(
    /\s+(?:Request\s+method|Request\s+Method|Status\s+Code|Remote\s+Address|Referrer\s+Policy).*$/i,
    ''
  );

  // Separate query string / hash so segment stripping preserves auth query tokens if present
  let basePart = url;
  let queryPart = '';
  const qIndex = url.indexOf('?');
  if (qIndex !== -1) {
    basePart = url.slice(0, qIndex);
    queryPart = url.slice(qIndex);
  }

  // Strip segment suffixes like /seg-247-v1-a1.ts, /seg-38-v1-a1.tsm, /segment_001.ts, /chunk-12.m4s
  const strippedBase = basePart
    .replace(/\/(?:seg|segment|chunk|frag|part|media)[-_]?[a-z0-9_-]*\.(?:ts|tsm|m4s|aac)(?=$)/i, '')
    .replace(/\/[a-z0-9_-]*-\d+-v\d+-a\d+\.(?:ts|tsm)(?=$)/i, '')
    .replace(/\/+$/, '');

  // Note: If queryPart belonged purely to a segment, keep queryPart only when basePart already had .m3u8/.mpd
  // or when query contains auth tokens (token, hdnea, expires, policy, signature, key-pair-id)
  if (
    queryPart &&
    (basePart.includes('.m3u8') ||
      basePart.includes('.mpd') ||
      /(token|hdnea|exp|expires|sig|signature|policy|auth|key)/i.test(queryPart))
  ) {
    return `${strippedBase}${queryPart}`;
  }

  return strippedBase;
}

/**
 * Extract the best stream URL candidate from raw text, prioritizing:
 * 1. Wistia deliveries URL
 * 2. .m3u8 URL (including .m3u8/seg-...ts)
 * 3. .mpd URL
 * 4. .ts / .tsm / .m4s / .bin segment URL
 */
function findStreamUrlCandidate(rawInput, detectedReferer) {
  const preprocessed = preprocessRawDump(rawInput);

  // Find all http(s) URLs in the dump, plus protocol-less Wistia delivery paths
  const httpMatches = preprocessed.match(/https?:\/\/[^\s"'`<>\\^]+/gi) || [];
  const bareWistiaMatches =
    preprocessed.match(/(?<![/:])embed-cloudfront\.wistia\.com\/deliveries\/[^\s"'`<>\\^]+/gi) ||
    [];
  const urlMatches = [
    ...httpMatches,
    ...bareWistiaMatches.map((u) => `https://${u}`),
  ];
  if (urlMatches.length === 0) return null;

  // Exclude the referer/origin URLs from being mistaken for the video stream when other candidates exist
  const cleanedCandidates = urlMatches.map((u) =>
    u.replace(/[",;)}\]]+$/, '')
  );

  const nonHeaderCandidates = cleanedCandidates.filter((u) => {
    if (!detectedReferer) return true;
    return u !== detectedReferer && !detectedReferer.startsWith(u);
  });

  const pool = nonHeaderCandidates.length > 0 ? nonHeaderCandidates : cleanedCandidates;

  // Priority 1: Wistia delivery URL
  const wistiaMatch = pool.find((u) =>
    /embed-cloudfront\.wistia\.com\/deliveries\/[a-zA-Z0-9_-]+/i.test(u)
  );
  if (wistiaMatch) return wistiaMatch;

  // Priority 2: Explicit .m3u8 URL
  const m3u8Match = pool.find((u) => /\.m3u8(?:[/?#]|$)/i.test(u));
  if (m3u8Match) return m3u8Match;

  // Priority 3: Explicit .mpd URL
  const mpdMatch = pool.find((u) => /\.mpd(?:[/?#]|$)/i.test(u));
  if (mpdMatch) return mpdMatch;

  // Priority 4: Segment / media URL (.ts, .tsm, .m4s, .bin, .mp4)
  const segMatch = pool.find((u) =>
    /(?:\/(?:seg|segment|chunk|frag|part)[-_]?\d+[^/?#]*|\.(?:ts|tsm|m4s|bin|mp4))(?:[?#]|$)/i.test(
      u
    )
  );
  if (segMatch) return segMatch;

  // Fallback: first URL if it looks like a stream path
  return pool[0] || null;
}

/**
 * Generate all CLI commands cleanly following Rules 3 & 4 (+ N_m3u8DL-RE).
 */
export function buildCommands({
  m3u8Url,
  binUrl = null,
  folderPath = 'D:/Lectures',
  fileName = 'video_1.mp4',
  threads = 16,
  referer = null,
  extraHeaders = {},
  includeExtraHeaders = false,
}) {
  if (!m3u8Url) {
    return {
      ytdlp_m3u8: '',
      ytdlp_bin: null,
      aria2c_bin: null,
      ytdlp_aria2c: '',
      n_m3u8dl_re: '',
    };
  }

  const safeThreads = [8, 16, 32].includes(Number(threads)) ? Number(threads) : 16;
  const folder = normalizeFolderPath(folderPath);
  const file = normalizeFileName(fileName);
  const stem = getFileStem(file);
  const cleanReferer = referer && referer.trim() ? referer.trim() : null;

  const folderFlagYtdlp = folder ? ` -P "${escapeShellDoubleQuotes(folder)}"` : '';
  const folderFlagAria = folder ? ` -d "${escapeShellDoubleQuotes(folder)}"` : '';
  const folderFlagNm3u8 = folder ? ` --save-dir "${escapeShellDoubleQuotes(folder)}"` : '';

  const refererFlagYtdlp = cleanReferer
    ? ` --referer "${escapeShellDoubleQuotes(cleanReferer)}"`
    : '';
  const refererFlagAria = cleanReferer
    ? ` --referer="${escapeShellDoubleQuotes(cleanReferer)}"`
    : '';
  const refererFlagNm3u8 = cleanReferer
    ? ` -H "Referer: ${escapeShellDoubleQuotes(cleanReferer)}"`
    : '';

  let extraYtdlpFlags = '';
  let extraAriaFlags = '';
  let extraNm3u8Flags = '';

  if (includeExtraHeaders && extraHeaders && typeof extraHeaders === 'object') {
    const headerTitleMap = {
      origin: 'Origin',
      cookie: 'Cookie',
      authorization: 'Authorization',
      'user-agent': 'User-Agent',
    };
    for (const [k, v] of Object.entries(extraHeaders)) {
      if (!v) continue;
      const headerName = headerTitleMap[k.toLowerCase()] || k;
      const escapedHeader = escapeShellDoubleQuotes(`${headerName}: ${v}`);
      extraYtdlpFlags += ` --add-header "${escapedHeader}"`;
      extraAriaFlags += ` --header="${escapedHeader}"`;
      extraNm3u8Flags += ` -H "${escapedHeader}"`;
    }
  }

  const escapedM3u8 = escapeShellDoubleQuotes(m3u8Url);
  const escapedFile = escapeShellDoubleQuotes(file);
  const escapedStem = escapeShellDoubleQuotes(stem);

  // Command 1: yt-dlp Multi-threaded HLS
  const ytdlp_m3u8 = `yt-dlp -N ${safeThreads}${refererFlagYtdlp}${extraYtdlpFlags} "${escapedM3u8}"${folderFlagYtdlp} -o "${escapedFile}"`;

  // Command 4: yt-dlp + aria2c External Downloader for .m3u8
  const ytdlp_aria2c = `yt-dlp --downloader aria2c --downloader-args "aria2c:-x ${safeThreads} -s ${safeThreads} -k 1M"${refererFlagYtdlp}${extraYtdlpFlags} "${escapedM3u8}"${folderFlagYtdlp} -o "${escapedFile}"`;

  // Command 5: N_m3u8DL-RE High-Speed Muxer
  const n_m3u8dl_re = `N_m3u8DL-RE "${escapedM3u8}" --thread-count ${safeThreads}${refererFlagNm3u8}${extraNm3u8Flags}${folderFlagNm3u8} --save-name "${escapedStem}" -M format=mp4`;

  // Wistia Direct .bin Commands 2 & 3
  let ytdlp_bin = null;
  let aria2c_bin = null;

  if (binUrl) {
    const escapedBin = escapeShellDoubleQuotes(binUrl);
    // Command 2: yt-dlp Direct Wistia .bin - Zero Merge Time
    ytdlp_bin = `yt-dlp -N ${safeThreads}${refererFlagYtdlp}${extraYtdlpFlags} "${escapedBin}"${folderFlagYtdlp} -o "${escapedFile}"`;
    // Command 3: aria2c Direct .bin - Maximum Bandwidth
    aria2c_bin = `aria2c -x ${safeThreads} -s ${safeThreads} -k 1M${refererFlagAria}${extraAriaFlags} "${escapedBin}"${folderFlagAria} -o "${escapedFile}"`;
  }

  return {
    ytdlp_m3u8,
    ytdlp_bin,
    aria2c_bin,
    ytdlp_aria2c,
    n_m3u8dl_re,
  };
}

/**
 * Instant 0ms client-side regex parser.
 */
export function parseRawInputLocally(rawInput, options = {}) {
  const {
    folderPath = 'D:/Lectures',
    fileName = 'video_1.mp4',
    threads = 16,
    manualReferer = '',
    includeExtraHeaders = false,
  } = options;

  if (!rawInput || !rawInput.trim()) {
    return {
      status: 'idle',
      source: 'regex',
      provider: 'unknown',
      hash: null,
      m3u8Url: '',
      binUrl: null,
      referer: null,
      extraHeaders: {},
      inferredFromBareSegment: false,
      commands: buildCommands({ m3u8Url: '' }),
      explanation: '',
    };
  }

  const { referer: detectedReferer, extraHeaders } = extractHeadersFromInput(rawInput);
  const effectiveReferer = (manualReferer && manualReferer.trim()) || detectedReferer || null;

  const candidate = findStreamUrlCandidate(rawInput, detectedReferer);
  if (!candidate) {
    return {
      status: 'unrecognized',
      source: 'regex',
      provider: 'unknown',
      hash: null,
      m3u8Url: '',
      binUrl: null,
      referer: detectedReferer,
      extraHeaders,
      inferredFromBareSegment: false,
      commands: buildCommands({ m3u8Url: '' }),
      explanation: 'No stream URL (.m3u8, .ts, .tsm, or Wistia hash) detected yet — try AI Smart Extract for heavily obfuscated dumps.',
    };
  }

  // Check Wistia pattern
  const wistiaMatch = candidate.match(
    /https?:\/\/embed-cloudfront\.wistia\.com\/deliveries\/([a-zA-Z0-9_-]+)/i
  );

  if (wistiaMatch) {
    const hash = wistiaMatch[1];
    const m3u8Url = `https://embed-cloudfront.wistia.com/deliveries/${hash}.m3u8`;
    const binUrl = `https://embed-cloudfront.wistia.com/deliveries/${hash}.bin`;

    return {
      status: 'parsed',
      source: 'regex',
      provider: 'wistia',
      hash,
      m3u8Url,
      binUrl,
      referer: detectedReferer,
      extraHeaders,
      inferredFromBareSegment: false,
      commands: buildCommands({
        m3u8Url,
        binUrl,
        folderPath,
        fileName,
        threads,
        referer: effectiveReferer,
        extraHeaders,
        includeExtraHeaders,
      }),
      explanation: `Detected Wistia delivery hash (${hash.slice(0, 10)}…) and synthesized both .m3u8 HLS and direct .bin endpoints.`,
    };
  }

  // Generic HLS / DASH / Segment URL cleaning
  const cleanedUrl = cleanStreamUrl(candidate);
  const hasManifestExt = /\.(?:m3u8|mpd)(?:[?#]|$)/i.test(cleanedUrl);
  const wasSegmentStripped = candidate !== cleanedUrl;

  const commands = buildCommands({
    m3u8Url: cleanedUrl,
    binUrl: null,
    folderPath,
    fileName,
    threads,
    referer: effectiveReferer,
    extraHeaders,
    includeExtraHeaders,
  });

  let explanation = 'Extracted clean stream URL from input.';
  if (wasSegmentStripped && hasManifestExt) {
    explanation = 'Stripped segment suffix & DevTools metadata to recover the base .m3u8 manifest URL.';
  } else if (wasSegmentStripped && !hasManifestExt) {
    explanation = 'Stripped segment suffix; verify whether the playlist requires /index.m3u8 or /playlist.m3u8 (or run AI Smart Extract).';
  } else if (hasManifestExt) {
    explanation = 'Cleaned DevTools garbage and extracted direct HLS/DASH manifest URL.';
  }

  return {
    status: 'parsed',
    source: 'regex',
    provider: hasManifestExt || wasSegmentStripped ? 'generic_hls' : 'unknown',
    hash: null,
    m3u8Url: cleanedUrl,
    binUrl: null,
    referer: detectedReferer,
    extraHeaders,
    inferredFromBareSegment: wasSegmentStripped && !hasManifestExt,
    commands,
    explanation,
  };
}
