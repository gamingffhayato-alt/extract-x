import React from 'react';
import {
  FolderOpen,
  FileVideo,
  Cpu,
  Globe,
  Plus,
  Sparkles,
  ShieldCheck,
  X,
} from 'lucide-react';
import { normalizeFolderPath } from '../utils/parser';

const THREAD_OPTIONS = [8, 16, 32];

export function ConfigBar({
  folderPath,
  onFolderPathChange,
  fileName,
  onFileNameChange,
  autoIncrement,
  onAutoIncrementChange,
  onBumpFileName,
  threads,
  onThreadsChange,
  manualReferer,
  onManualRefererChange,
  detectedReferer,
  detectedExtraHeaders,
  includeExtraHeaders,
  onIncludeExtraHeadersChange,
  onApplyDetectedReferer,
}) {
  const hasBackslashes = folderPath.includes('\\');
  const normalizedPreview = normalizeFolderPath(folderPath);
  const extraHeaderKeys = Object.keys(detectedExtraHeaders || {});
  const usingAutoReferer = !manualReferer.trim() && Boolean(detectedReferer);

  return (
    <section
      aria-label="Download Configuration"
      className="rounded-2xl border border-zinc-800/90 bg-[#0b0f17]/95 p-4 sm:p-5 shadow-xl"
    >
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Output & Engine Configuration
          </h2>
          <span className="rounded-md bg-zinc-800/80 px-2 py-0.5 text-[10px] font-medium text-zinc-400 border border-zinc-700/60">
            Saved in localStorage
          </span>
        </div>

        {extraHeaderKeys.length > 0 && (
          <button
            type="button"
            onClick={() => onIncludeExtraHeadersChange(!includeExtraHeaders)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              includeExtraHeaders
                ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Include {extraHeaderKeys.length} Extra Header{extraHeaderKeys.length > 1 ? 's' : ''} (
            {extraHeaderKeys.join(', ')})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
        {/* Save Folder Path */}
        <div className="xl:col-span-4">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              htmlFor="folder-path-input"
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-300"
            >
              <FolderOpen className="h-3.5 w-3.5 text-cyan-400" />
              Save Folder Path
            </label>
            {hasBackslashes && (
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded">
                \ → / ({normalizedPreview})
              </span>
            )}
          </div>
          <input
            id="folder-path-input"
            type="text"
            value={folderPath}
            onChange={(e) => onFolderPathChange(e.target.value)}
            placeholder="D:/Lectures"
            spellCheck={false}
            className="w-full rounded-xl border border-zinc-800 bg-[#06080d] px-3.5 py-2.5 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
          />
        </div>

        {/* Output Filename + Auto-increment */}
        <div className="xl:col-span-4">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              htmlFor="output-filename-input"
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-300"
            >
              <FileVideo className="h-3.5 w-3.5 text-cyan-400" />
              Output Filename
            </label>

            <button
              type="button"
              onClick={() => onAutoIncrementChange(!autoIncrement)}
              role="switch"
              aria-checked={autoIncrement}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                autoIncrement
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
              }`}
              title="Automatically increment filename (video_1 → video_2) each time a new link is pasted"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  autoIncrement ? 'bg-emerald-400' : 'bg-zinc-600'
                }`}
              />
              Auto-increment {autoIncrement ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              id="output-filename-input"
              type="text"
              value={fileName}
              onChange={(e) => onFileNameChange(e.target.value)}
              placeholder="video_1.mp4"
              spellCheck={false}
              className="w-full rounded-xl border border-zinc-800 bg-[#06080d] px-3.5 py-2.5 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
            />
            <button
              type="button"
              onClick={onBumpFileName}
              title="Increment filename counter (+1)"
              className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs font-mono font-medium text-zinc-300 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />1
            </button>
          </div>
        </div>

        {/* Thread Count Selector */}
        <div className="xl:col-span-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
              <Cpu className="h-3.5 w-3.5 text-cyan-400" />
              Threads
            </span>
            {threads === 32 && (
              <span
                title="Note: Standard aria2c builds cap -x at 16 connections per server; custom aria2c builds & yt-dlp/N_m3u8DL-RE support 32"
                className="text-[10px] text-amber-300/90 cursor-help"
              >
                Max speed
              </span>
            )}
          </div>
          <div
            role="group"
            aria-label="Thread count"
            className="grid grid-cols-3 gap-1 rounded-xl border border-zinc-800 bg-[#06080d] p-1"
          >
            {THREAD_OPTIONS.map((count) => {
              const active = threads === count;
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => onThreadsChange(count)}
                  className={`rounded-lg py-2 font-mono text-xs font-semibold transition-all ${
                    active
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-zinc-400 border border-transparent hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  {count}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Referer */}
        <div className="xl:col-span-2 md:col-span-2">
          <div className="mb-1.5 flex items-center justify-between gap-1.5">
            <label
              htmlFor="referer-input"
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-300"
            >
              <Globe className="h-3.5 w-3.5 text-cyan-400" />
              Referer
              <span className="text-[10px] text-zinc-500 font-normal">(optional)</span>
            </label>

            {usingAutoReferer && (
              <button
                type="button"
                onClick={() => onApplyDetectedReferer?.(detectedReferer)}
                title="Auto-detected from pasted cURL/headers — click to edit as custom"
                className="inline-flex items-center gap-1 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25"
              >
                <Sparkles className="h-2.5 w-2.5" />
                Auto
              </button>
            )}
          </div>
          <div className="relative">
            <input
              id="referer-input"
              type="text"
              value={manualReferer}
              onChange={(e) => onManualRefererChange(e.target.value)}
              placeholder={detectedReferer ? detectedReferer : 'https://site.com/'}
              spellCheck={false}
              className={`w-full rounded-xl border bg-[#06080d] px-3.5 py-2.5 pr-8 font-mono text-xs text-zinc-100 focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all ${
                usingAutoReferer
                  ? 'border-cyan-500/40 placeholder:text-cyan-300/80'
                  : 'border-zinc-800 placeholder:text-zinc-600'
              }`}
            />
            {manualReferer && (
              <button
                type="button"
                onClick={() => onManualRefererChange('')}
                aria-label="Clear custom referer"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
