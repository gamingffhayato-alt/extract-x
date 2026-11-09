import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Terminal,
  Sparkles,
  ClipboardPaste,
  Trash2,
  Zap,
  CheckCircle2,
  AlertCircle,
  Link2,
  Hash,
  Globe,
  Loader2,
  Code2,
  Download,
  Copy,
  ListChecks,
  X,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  SAMPLE_PRESETS,
  buildCommands,
  incrementFileName,
  normalizeFileName,
  normalizeFolderPath,
  parseRawInputLocally,
} from './utils/parser';
import { ConfigBar } from './components/ConfigBar';
import { CommandTerminalCard } from './components/CommandTerminalCard';
import { ToastContainer } from './components/Toast';

const STORAGE_KEY = 'streamforge_cli_config_v1';

function loadSavedConfig() {
  const defaults = {
    folderPath: 'D:/Lectures',
    fileName: 'video_1.mp4',
    autoIncrement: true,
    threads: 16,
    manualReferer: '',
    includeExtraHeaders: false,
  };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      folderPath: typeof parsed.folderPath === 'string' ? parsed.folderPath : defaults.folderPath,
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : defaults.fileName,
      autoIncrement:
        typeof parsed.autoIncrement === 'boolean' ? parsed.autoIncrement : defaults.autoIncrement,
      threads: [8, 16, 32].includes(Number(parsed.threads))
        ? Number(parsed.threads)
        : defaults.threads,
      manualReferer:
        typeof parsed.manualReferer === 'string' ? parsed.manualReferer : defaults.manualReferer,
      includeExtraHeaders:
        typeof parsed.includeExtraHeaders === 'boolean'
          ? parsed.includeExtraHeaders
          : defaults.includeExtraHeaders,
    };
  } catch {
    return defaults;
  }
}

export default function App() {
  const initialConfig = useMemo(() => loadSavedConfig(), []);

  const [rawInput, setRawInput] = useState('');
  const [folderPath, setFolderPath] = useState(initialConfig.folderPath);
  const [fileName, setFileName] = useState(initialConfig.fileName);
  const [autoIncrement, setAutoIncrement] = useState(initialConfig.autoIncrement);
  const [threads, setThreads] = useState(initialConfig.threads);
  const [manualReferer, setManualReferer] = useState(initialConfig.manualReferer);
  const [includeExtraHeaders, setIncludeExtraHeaders] = useState(
    initialConfig.includeExtraHeaders
  );

  // AI Deep Parse state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiExtracted, setAiExtracted] = useState(null);

  // Batch Queue & Toasts
  const [batchQueue, setBatchQueue] = useState([]);
  const [toasts, setToasts] = useState([]);

  // Track previous parsed stream URL so auto-increment runs cleanly on subsequent new pastes
  const hasSeenStreamRef = useRef(false);
  const lastStreamKeyRef = useRef('');

  // Persist configuration to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          folderPath,
          fileName,
          autoIncrement,
          threads,
          manualReferer,
          includeExtraHeaders,
        })
      );
    } catch {
      // Ignore storage quota / private-mode errors
    }
  }, [folderPath, fileName, autoIncrement, threads, manualReferer, includeExtraHeaders]);

  const addToast = ({ title, message, type = 'success' }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Instant 0ms Local Regex Parser
  const localParsed = useMemo(() => {
    return parseRawInputLocally(rawInput, {
      folderPath,
      fileName,
      threads,
      manualReferer,
      includeExtraHeaders,
    });
  }, [rawInput, folderPath, fileName, threads, manualReferer, includeExtraHeaders]);

  // Unified active parse result (AI override if matching current rawInput, else 0ms regex)
  const activeResult = useMemo(() => {
    if (aiExtracted && aiExtracted.rawInput === rawInput && aiExtracted.m3u8Url) {
      const effectiveReferer =
        (manualReferer && manualReferer.trim()) || aiExtracted.referer || null;

      const mergedExtraHeaders = localParsed.extraHeaders || {};
      const commands = buildCommands({
        m3u8Url: aiExtracted.m3u8Url,
        binUrl: aiExtracted.binUrl,
        folderPath,
        fileName,
        threads,
        referer: effectiveReferer,
        extraHeaders: mergedExtraHeaders,
        includeExtraHeaders,
      });

      return {
        status: 'parsed',
        source: 'groq_ai',
        provider: aiExtracted.provider,
        hash: aiExtracted.hash,
        m3u8Url: aiExtracted.m3u8Url,
        binUrl: aiExtracted.binUrl,
        referer: aiExtracted.referer,
        extraHeaders: mergedExtraHeaders,
        inferredFromBareSegment: false,
        commands,
        explanation: aiExtracted.explanation,
      };
    }
    return localParsed;
  }, [
    aiExtracted,
    rawInput,
    localParsed,
    folderPath,
    fileName,
    threads,
    manualReferer,
    includeExtraHeaders,
  ]);

  // Update stream tracking & trigger auto-increment when a new pasted link arrives
  const handlePastedOrLoadedText = (newText, { triggerAutoIncrement = true } = {}) => {
    setAiError(null);
    setRawInput(newText);

    const previewParse = parseRawInputLocally(newText, {
      folderPath,
      fileName,
      threads,
      manualReferer,
      includeExtraHeaders,
    });

    const streamKey = previewParse.hash || previewParse.m3u8Url || '';
    if (!streamKey) return;

    if (
      triggerAutoIncrement &&
      autoIncrement &&
      hasSeenStreamRef.current &&
      lastStreamKeyRef.current &&
      lastStreamKeyRef.current !== streamKey
    ) {
      setFileName((prev) => {
        const nextName = incrementFileName(prev);
        addToast({
          title: 'Auto-incremented filename',
          message: `Output filename updated to ${nextName}`,
          type: 'info',
        });
        return nextName;
      });
    }

    hasSeenStreamRef.current = true;
    lastStreamKeyRef.current = streamKey;
  };

  // Track manually typed streams too so subsequent pastes know a previous stream existed
  useEffect(() => {
    const key = activeResult.hash || activeResult.m3u8Url || '';
    if (key) {
      hasSeenStreamRef.current = true;
      lastStreamKeyRef.current = key;
    }
  }, [activeResult.hash, activeResult.m3u8Url]);

  const handleTextareaChange = (e) => {
    setAiError(null);
    setRawInput(e.target.value);
  };

  const handleTextareaPaste = (e) => {
    const pasted = e.clipboardData?.getData('text');
    if (typeof pasted === 'string' && pasted.trim()) {
      // Let textarea update cleanly or handle full replacement when selecting all / empty
      const target = e.target;
      const isReplacingAll =
        target.selectionStart === 0 && target.selectionEnd === rawInput.length;
      const isCurrentlyEmpty = !rawInput.trim();
      if (isReplacingAll || isCurrentlyEmpty) {
        e.preventDefault();
        handlePastedOrLoadedText(pasted, { triggerAutoIncrement: true });
      } else {
        // Appending inside existing text: inspect combined text on next tick
        const nextCombined =
          rawInput.slice(0, target.selectionStart) +
          pasted +
          rawInput.slice(target.selectionEnd);
        setTimeout(() => {
          const preview = parseRawInputLocally(nextCombined);
          const streamKey = preview.hash || preview.m3u8Url || '';
          if (
            streamKey &&
            autoIncrement &&
            hasSeenStreamRef.current &&
            lastStreamKeyRef.current &&
            lastStreamKeyRef.current !== streamKey
          ) {
            setFileName((prev) => {
              const nextName = incrementFileName(prev);
              addToast({
                title: 'Auto-incremented filename',
                message: `Output filename updated to ${nextName}`,
                type: 'info',
              });
              return nextName;
            });
          }
          if (streamKey) {
            hasSeenStreamRef.current = true;
            lastStreamKeyRef.current = streamKey;
          }
        }, 0);
      }
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText || !clipText.trim()) {
        addToast({
          title: 'Clipboard is empty',
          message: 'Copy a stream URL, DevTools dump, or cURL command first.',
          type: 'warning',
        });
        return;
      }
      handlePastedOrLoadedText(clipText, { triggerAutoIncrement: true });
      addToast({
        title: 'Pasted from clipboard',
        message: 'Parsed stream input automatically.',
        type: 'info',
      });
    } catch {
      addToast({
        title: 'Clipboard permission blocked',
        message: 'Click inside the text box and press Ctrl+V / Cmd+V to paste.',
        type: 'warning',
      });
    }
  };

  const handleClear = () => {
    setRawInput('');
    setAiExtracted(null);
    setAiError(null);
  };

  const handleLoadSample = (sample) => {
    handlePastedOrLoadedText(sample.input, { triggerAutoIncrement: true });
    addToast({
      title: `Loaded sample: ${sample.label}`,
      message: 'Instant 0ms regex engine extracted stream commands.',
      type: 'info',
    });
  };

  const handleBumpFileName = () => {
    setFileName((prev) => incrementFileName(prev));
  };

  const handleAiSmartExtract = async () => {
    if (!rawInput.trim()) {
      addToast({
        title: 'Nothing to analyze',
        message: 'Paste a DevTools dump, segment URL, or cURL command first.',
        type: 'warning',
      });
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawInput,
          folderPath: normalizeFolderPath(folderPath),
          fileName: normalizeFileName(fileName),
          threads,
          referer: manualReferer.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAiError({
          code: data.code || 'API_ERROR',
          message:
            data.error ||
            `Server returned HTTP ${res.status}. Check /api/parse configuration.`,
        });
        return;
      }

      setAiExtracted({
        rawInput,
        provider: data.provider || 'generic_hls',
        hash: data.hash || null,
        m3u8Url: data.m3u8Url || '',
        binUrl: data.binUrl || null,
        referer: data.referer || null,
        explanation: data.explanation || 'Parsed via Groq Llama-3.3-70B.',
      });

      if (data.m3u8Url) {
        hasSeenStreamRef.current = true;
        lastStreamKeyRef.current = data.hash || data.m3u8Url;
      }

      addToast({
        title: 'AI Smart Extract complete',
        message: data.explanation || 'Extracted stream URL and CLI commands via Groq.',
        type: 'success',
      });
    } catch (err) {
      setAiError({
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Failed to reach /api/parse endpoint.',
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyCommand = (title, _cmd, failed = false) => {
    if (failed) {
      addToast({
        title: 'Copy failed',
        message: 'Please select the command text manually and copy.',
        type: 'warning',
      });
      return;
    }
    addToast({
      title: 'Copied to clipboard',
      message: `${title} command ready to run in your terminal.`,
      type: 'success',
    });
  };

  const handleAddToQueue = (title, command) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setBatchQueue((prev) => [
      ...prev,
      {
        id,
        title,
        fileName: normalizeFileName(fileName),
        command,
      },
    ]);
    addToast({
      title: 'Added to Batch Queue',
      message: `${normalizeFileName(fileName)} (${title}) queued.`,
      type: 'info',
    });
  };

  const handleCopyBatch = async () => {
    if (batchQueue.length === 0) return;
    const script = batchQueue.map((item) => item.command).join('\n');
    try {
      await navigator.clipboard.writeText(script);
      addToast({
        title: `Copied ${batchQueue.length} commands`,
        message: 'Batch commands copied to clipboard.',
        type: 'success',
      });
    } catch {
      addToast({
        title: 'Copy failed',
        message: 'Could not access clipboard.',
        type: 'warning',
      });
    }
  };

  const handleDownloadScript = (ext) => {
    if (batchQueue.length === 0) return;
    const header =
      ext === 'ps1'
        ? '# StreamForge CLI Batch Download Script (PowerShell)\n$ErrorActionPreference = "Continue"\n\n'
        : '#!/usr/bin/env bash\n# StreamForge CLI Batch Download Script\n\n';
    const body = batchQueue.map((item) => item.command).join('\n');
    const blob = new Blob([header + body + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `streamforge_batch.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isParsed = activeResult.status === 'parsed' && Boolean(activeResult.m3u8Url);
  const isWistia = activeResult.provider === 'wistia' && Boolean(activeResult.binUrl);
  const activeReferer =
    (manualReferer && manualReferer.trim()) || activeResult.referer || null;

  // Build ordered command cards list
  const commandCards = useMemo(() => {
    if (!isParsed) return [];
    const { commands } = activeResult;
    const cards = [];

    if (isWistia && commands.aria2c_bin) {
      cards.push({
        id: 'aria2c_bin',
        title: 'aria2c Direct .bin',
        badge: `Fastest: Direct .bin + aria2c (${threads}x)`,
        badgeTone: 'emerald',
        icon: 'rocket',
        recommended: true,
        description:
          'Downloads the unsegmented Wistia .bin stream directly over maximum parallel connections — zero HLS segment overhead and zero ffmpeg merge time.',
        command: commands.aria2c_bin,
        note:
          threads === 32
            ? 'Note: Standard aria2c builds cap -x at 16 connections per server; custom aria2c builds support 32.'
            : null,
      });
    }

    if (isWistia && commands.ytdlp_bin) {
      cards.push({
        id: 'ytdlp_bin',
        title: 'yt-dlp Direct .bin',
        badge: `Zero Merge: Direct Wistia .bin (${threads} Threads)`,
        badgeTone: 'cyan',
        icon: 'zap',
        recommended: false,
        description:
          'Single-stream unsegmented .bin download handled cleanly by yt-dlp with retries, resume support, and custom folder routing.',
        command: commands.ytdlp_bin,
      });
    }

    if (commands.ytdlp_aria2c) {
      cards.push({
        id: 'ytdlp_aria2c',
        title: 'yt-dlp + aria2c HLS',
        badge: `Turbo HLS: yt-dlp + aria2c (${threads}x)`,
        badgeTone: isWistia ? 'violet' : 'emerald',
        icon: 'cpu',
        recommended: !isWistia,
        description:
          'Combines yt-dlp playlist/manifest parsing with aria2c multi-connection downloading for encrypted or generic .m3u8 streams.',
        command: commands.ytdlp_aria2c,
      });
    }

    if (commands.ytdlp_m3u8) {
      cards.push({
        id: 'ytdlp_m3u8',
        title: 'yt-dlp Multi-threaded HLS',
        badge: `Standard: yt-dlp ${threads} Threads`,
        badgeTone: 'cyan',
        icon: 'layers',
        recommended: false,
        description:
          'Native multi-threaded HLS segment downloader using yt-dlp -N with zero external downloader dependencies.',
        command: commands.ytdlp_m3u8,
      });
    }

    if (commands.n_m3u8dl_re) {
      cards.push({
        id: 'n_m3u8dl_re',
        title: 'N_m3u8DL-RE High-Speed Muxer',
        badge: `Pro Muxer: N_m3u8DL-RE (${threads} Threads)`,
        badgeTone: 'amber',
        icon: 'sparkles',
        recommended: false,
        description:
          'Ultra-fast native C#/.NET HLS & DASH stream downloader with built-in concurrent decryption and MP4 muxing.',
        command: commands.n_m3u8dl_re,
      });
    }

    return cards;
  }, [isParsed, isWistia, activeResult, threads]);

  return (
    <div className="min-h-screen bg-dev-grid text-zinc-100 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-[#07090e]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/20 via-zinc-900 to-emerald-500/15 shadow-glow">
              <Terminal className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  StreamForge <span className="text-cyan-400 font-mono">CLI</span>
                </h1>
                <span className="hidden sm:inline-flex items-center rounded-md border border-zinc-700/80 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                  v1.0
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-zinc-400">
                DevTools dumps, .ts/.tsm segments & cURL → high-speed{' '}
                <code className="font-mono text-zinc-300">yt-dlp</code>,{' '}
                <code className="font-mono text-zinc-300">aria2c</code> &{' '}
                <code className="font-mono text-zinc-300">N_m3u8DL-RE</code>
              </p>
            </div>
          </div>

          {/* Live Hybrid Engine Status Pills */}
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-300">
              <Zap className="h-3 w-3" />
              <span>0ms Local Regex</span>
            </div>
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium ${
                activeResult.source === 'groq_ai'
                  ? 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200'
                  : 'border-zinc-700/80 bg-zinc-900/90 text-zinc-400'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              <span>Groq Llama-3.3-70B</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 space-y-6">
        {/* Input Workspace Panel */}
        <section
          aria-label="Raw Network Dump Input"
          className="rounded-2xl border border-zinc-800/90 bg-[#0b0f17]/95 shadow-2xl overflow-hidden"
        >
          {/* Input Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-900/50 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <Code2 className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                Raw Input Stream / Network Dump
              </span>
              <span className="hidden md:inline text-xs text-zinc-500">
                — Paste DevTools request text, .ts/.tsm/.m3u8 URLs, or full cURL
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/90 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-cyan-500/40 hover:bg-zinc-800 hover:text-white transition-colors"
              >
                <ClipboardPaste className="h-3.5 w-3.5 text-cyan-400" />
                Paste from Clipboard
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={!rawInput}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
              <button
                type="button"
                onClick={handleAiSmartExtract}
                disabled={aiLoading || !rawInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 via-sky-500 to-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 shadow-glow hover:brightness-110 disabled:opacity-45 disabled:pointer-events-none transition-all"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Extracting with Groq...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    AI Smart Extract
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Sample Presets Strip */}
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/60 bg-[#080b12] px-4 py-2 sm:px-5">
            <span className="text-[11px] font-medium text-zinc-500">Quick Samples:</span>
            {SAMPLE_PRESETS.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => handleLoadSample(sample)}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/70 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors"
              >
                <span className="font-mono text-[10px] text-cyan-400">{sample.badge}</span>
                <span className="text-zinc-600">•</span>
                <span>{sample.label}</span>
              </button>
            ))}
          </div>

          {/* Monospace Textarea */}
          <div className="p-4 sm:p-5">
            <textarea
              aria-label="Paste DevTools network dump, segment URL, or cURL command"
              value={rawInput}
              onChange={handleTextareaChange}
              onPaste={handleTextareaPaste}
              rows={5}
              spellCheck={false}
              placeholder={`Paste messy Chrome DevTools network dump, .ts/.tsm segment URL, or cURL here...\n\nExample:\nhttps://embed-cloudfront.wistia.com/deliveries/8f4c2a1e9b7d6c5f4a3b2c1d0e9f8a7b6c5d4e3f.m3u8/seg-247-v1-a1.ts Request method GET\n\nOr paste a full curl 'https://...' -H 'referer: https://...' command!`}
              className="w-full resize-y rounded-xl border border-zinc-800/90 bg-[#05070b] p-4 font-mono text-xs sm:text-[13px] leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all min-h-[136px]"
            />

            {/* Diagnostic Extraction Strip */}
            {(isParsed || activeResult.status === 'unrecognized' || aiError) && (
              <div className="mt-3 space-y-2.5">
                {aiError && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-semibold text-amber-100">
                        Groq AI Smart Extract unavailable ({aiError.code})
                      </p>
                      <p className="text-amber-200/90 leading-relaxed">{aiError.message}</p>
                      {isParsed && (
                        <p className="text-[11px] text-emerald-300 pt-0.5">
                          Instant Local Regex Engine results remain active below.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {activeResult.status === 'unrecognized' && !aiError && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-xs text-zinc-300">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 shrink-0 text-cyan-400" />
                      <span>{activeResult.explanation}</span>
                    </div>
                  </div>
                )}

                {isParsed && (
                  <div className="rounded-xl border border-zinc-800/90 bg-[#070a11] p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold uppercase ${
                            isWistia
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                          }`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {isWistia ? 'Wistia Delivery' : 'Generic HLS / Stream'}
                        </span>

                        <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400">
                          Parsed via{' '}
                          <strong className="text-zinc-200">
                            {activeResult.source === 'groq_ai'
                              ? 'Groq AI (Llama-3.3-70B)'
                              : 'Instant Regex (0ms)'}
                          </strong>
                        </span>

                        {activeResult.hash && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                            <Hash className="h-3 w-3 text-cyan-400" />
                            {activeResult.hash.length > 18
                              ? `${activeResult.hash.slice(0, 18)}…`
                              : activeResult.hash}
                          </span>
                        )}

                        {activeReferer && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono text-[11px] text-violet-200 max-w-xs truncate">
                            <Globe className="h-3 w-3 shrink-0 text-violet-300" />
                            Referer: {activeReferer}
                          </span>
                        )}
                      </div>
                    </div>

                    {activeResult.explanation && (
                      <p className="text-[11px] text-zinc-400 mb-2">{activeResult.explanation}</p>
                    )}

                    <div className="grid grid-cols-1 gap-1.5 font-mono text-[11px]">
                      <div className="flex items-center gap-2 rounded-lg bg-zinc-900/80 px-2.5 py-1.5 border border-zinc-800/70 overflow-x-auto">
                        <Link2 className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                        <span className="text-zinc-500 shrink-0">HLS:</span>
                        <span className="text-amber-200 truncate select-all">
                          {activeResult.m3u8Url}
                        </span>
                      </div>
                      {activeResult.binUrl && (
                        <div className="flex items-center gap-2 rounded-lg bg-zinc-900/80 px-2.5 py-1.5 border border-emerald-500/20 overflow-x-auto">
                          <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          <span className="text-zinc-500 shrink-0">BIN:</span>
                          <span className="text-emerald-300 truncate select-all">
                            {activeResult.binUrl}
                          </span>
                        </div>
                      )}
                    </div>

                    {activeResult.inferredFromBareSegment && (
                      <p className="mt-2 text-[11px] text-amber-300 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        This non-Wistia segment URL had no explicit <code>.m3u8</code> path before{' '}
                        <code>/seg-...</code>. Verify playlist filename or run{' '}
                        <strong>AI Smart Extract</strong> if needed.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Configuration Bar */}
        <ConfigBar
          folderPath={folderPath}
          onFolderPathChange={setFolderPath}
          fileName={fileName}
          onFileNameChange={setFileName}
          autoIncrement={autoIncrement}
          onAutoIncrementChange={setAutoIncrement}
          onBumpFileName={handleBumpFileName}
          threads={threads}
          onThreadsChange={setThreads}
          manualReferer={manualReferer}
          onManualRefererChange={setManualReferer}
          detectedReferer={activeResult.referer}
          detectedExtraHeaders={activeResult.extraHeaders}
          includeExtraHeaders={includeExtraHeaders}
          onIncludeExtraHeadersChange={setIncludeExtraHeaders}
          onApplyDetectedReferer={(ref) => setManualReferer(ref)}
        />

        {/* Output Command Cards */}
        <section aria-label="Generated CLI Commands" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-zinc-100">
                Generated High-Speed CLI Commands
              </h2>
              {isParsed && (
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                  {commandCards.length} ready
                </span>
              )}
            </div>

            {isParsed && (
              <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" /> Binary
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-fuchsia-400" /> Flags
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-300" /> Stream URL
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-cyan-300" /> Path / Output
                </span>
              </div>
            )}
          </div>

          {!isParsed ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-[#090d14]/80 p-8 sm:p-10 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/90 text-cyan-400">
                <Terminal className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-200 mb-1.5">
                Waiting for a stream URL, DevTools dump, or cURL paste
              </h3>
              <p className="mx-auto max-w-xl text-xs text-zinc-400 leading-relaxed mb-5">
                Paste any noisy Chrome DevTools snippet, <code className="text-cyan-300">.ts</code> /{' '}
                <code className="text-cyan-300">.tsm</code> segment URL, Wistia delivery link, or{' '}
                <code className="text-cyan-300">cURL</code> command above. Commands for{' '}
                <code className="text-emerald-300">yt-dlp</code>,{' '}
                <code className="text-emerald-300">aria2c</code>, and{' '}
                <code className="text-emerald-300">N_m3u8DL-RE</code> appear instantaneously.
              </p>

              <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => handleLoadSample(SAMPLE_PRESETS[0])}
                  className="group rounded-xl border border-zinc-800/90 bg-zinc-900/50 p-3.5 hover:border-cyan-500/40 hover:bg-zinc-900/90 transition-all"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-200 mb-1">
                    <span>Wistia + DevTools</span>
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-500 group-hover:text-cyan-400 transition-colors" />
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Strips <code>/seg-247-v1-a1.ts</code> &amp; <code>Request method GET</code>,
                    unlocks direct <code>.bin</code>
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleLoadSample(SAMPLE_PRESETS[1])}
                  className="group rounded-xl border border-zinc-800/90 bg-zinc-900/50 p-3.5 hover:border-cyan-500/40 hover:bg-zinc-900/90 transition-all"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-200 mb-1">
                    <span>Wistia .tsm Segment</span>
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-500 group-hover:text-cyan-400 transition-colors" />
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Extracts delivery hash from <code>/seg-38-v1-a1.tsm</code> for max-speed{' '}
                    <code>aria2c</code>
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleLoadSample(SAMPLE_PRESETS[2])}
                  className="group rounded-xl border border-zinc-800/90 bg-zinc-900/50 p-3.5 hover:border-cyan-500/40 hover:bg-zinc-900/90 transition-all"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-200 mb-1">
                    <span>cURL + Headers</span>
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-500 group-hover:text-cyan-400 transition-colors" />
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Auto-extracts <code>--referer</code>, <code>Origin</code> &amp; query tokens
                  </p>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {commandCards.map((card) => (
                <CommandTerminalCard
                  key={card.id}
                  title={card.title}
                  badge={card.badge}
                  badgeTone={card.badgeTone}
                  description={card.description}
                  command={card.command}
                  icon={card.icon}
                  recommended={card.recommended}
                  note={card.note}
                  onCopy={handleCopyCommand}
                  onQueueAdd={handleAddToQueue}
                />
              ))}
            </div>
          )}
        </section>

        {/* Batch Queue Panel (Shown when >= 1 command queued) */}
        {batchQueue.length > 0 && (
          <section
            aria-label="Batch Script Queue"
            className="rounded-2xl border border-cyan-500/30 bg-[#0a101b]/95 p-4 sm:p-5 shadow-glow"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-white">
                  Batch Download Queue ({batchQueue.length})
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyBatch}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/35 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/30 transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy All
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadScript('sh')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-600 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  .sh
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadScript('ps1')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-600 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  .ps1
                </button>
                <button
                  type="button"
                  onClick={() => setBatchQueue([])}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {batchQueue.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-[#05070b] px-3 py-2 font-mono text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-zinc-500 shrink-0">#{idx + 1}</span>
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-cyan-300 shrink-0">
                      {item.fileName}
                    </span>
                    <span className="truncate text-zinc-300">{item.command}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setBatchQueue((prev) => prev.filter((entry) => entry.id !== item.id))
                    }
                    aria-label="Remove item from queue"
                    className="shrink-0 text-zinc-500 hover:text-rose-400 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Subtle Footer */}
      <footer className="border-t border-zinc-900/90 py-4 px-4 sm:px-6 text-center text-[11px] text-zinc-500">
        StreamForge CLI • Hybrid 0ms Client Regex + Groq{' '}
        <code className="font-mono text-zinc-400">llama-3.3-70b-versatile</code> Serverless
        Extractor
      </footer>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
