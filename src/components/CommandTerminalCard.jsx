import React, { useState } from 'react';
import {
  Check,
  Copy,
  Terminal,
  Zap,
  Rocket,
  Cpu,
  Layers,
  ListPlus,
  Sparkles,
} from 'lucide-react';

/**
 * Deterministic CLI lexical tokenizer for terminal syntax highlighting.
 * Never alters underlying raw string for copying.
 */
function tokenizeCommand(command) {
  if (!command) return [];
  const tokens = [];
  let i = 0;
  let seenExecutable = false;

  const pushQuoted = (startIndex, kindHint = null) => {
    let j = startIndex + 1;
    while (j < command.length) {
      if (command[j] === '\\' && j + 1 < command.length) {
        j += 2;
        continue;
      }
      if (command[j] === '"') {
        j += 1;
        break;
      }
      j += 1;
    }
    const raw = command.slice(startIndex, j);
    const inner = raw.slice(1, -1);

    let type = kindHint;
    if (!type) {
      if (/^https?:\/\//i.test(inner)) {
        type = 'url';
      } else if (/^aria2c:/i.test(inner)) {
        type = 'args';
      } else if (/^(referer|origin|cookie|authorization|user-agent)\s*:/i.test(inner)) {
        type = 'header';
      } else {
        type = 'path';
      }
    }

    tokens.push({ type, text: raw });
    return j;
  };

  while (i < command.length) {
    // Whitespace
    if (/\s/.test(command[i])) {
      let j = i;
      while (j < command.length && /\s/.test(command[j])) j++;
      tokens.push({ type: 'space', text: command.slice(i, j) });
      i = j;
      continue;
    }

    // Quoted token
    if (command[i] === '"') {
      i = pushQuoted(i);
      continue;
    }

    // Read up to next whitespace
    let j = i;
    while (j < command.length && !/\s/.test(command[j]) && command[j] !== '"') {
      j++;
    }
    const word = command.slice(i, j);

    if (!seenExecutable) {
      tokens.push({ type: 'exec', text: word });
      seenExecutable = true;
      i = j;
      continue;
    }

    // Flag with inline =value (e.g. --referer="https://..." or --header="...")
    if (word.startsWith('-') && command[j] === '"' && word.endsWith('=')) {
      const flagPart = word.slice(0, -1);
      tokens.push({ type: 'flag', text: flagPart });
      tokens.push({ type: 'punct', text: '=' });
      const hint = /referer/i.test(flagPart) ? 'url' : 'header';
      i = pushQuoted(j, hint);
      continue;
    }

    if (word.startsWith('-')) {
      tokens.push({ type: 'flag', text: word });
    } else if (/^\d+[KMG]?$/i.test(word)) {
      tokens.push({ type: 'number', text: word });
    } else if (/^format=mp4$/i.test(word)) {
      tokens.push({ type: 'args', text: word });
    } else {
      tokens.push({ type: 'plain', text: word });
    }
    i = j;
  }

  return tokens;
}

const TOKEN_CLASSES = {
  exec: 'text-emerald-400 font-semibold',
  flag: 'text-fuchsia-400',
  url: 'text-amber-300',
  path: 'text-cyan-300',
  header: 'text-violet-300',
  args: 'text-sky-300',
  number: 'text-orange-300 font-medium',
  punct: 'text-zinc-500',
  plain: 'text-zinc-200',
  space: '',
};

const ICON_MAP = {
  rocket: Rocket,
  zap: Zap,
  cpu: Cpu,
  layers: Layers,
  sparkles: Sparkles,
};

export function CommandTerminalCard({
  title,
  badge,
  badgeTone = 'cyan',
  description,
  command,
  icon = 'zap',
  recommended = false,
  note = null,
  onCopy,
  onQueueAdd,
}) {
  const [copied, setCopied] = useState(false);

  if (!command) return null;

  const IconComponent = ICON_MAP[icon] || Terminal;
  const tokens = tokenizeCommand(command);

  const badgeStyles = {
    emerald:
      'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    cyan: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    zinc: 'bg-zinc-800/90 text-zinc-300 border-zinc-700',
  }[badgeTone] || 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      onCopy?.(title, command);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback copy method
      try {
        const textarea = document.createElement('textarea');
        textarea.value = command;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        onCopy?.(title, command);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        onCopy?.(title, command, true);
      }
    }
  };

  return (
    <div
      className={`group relative rounded-2xl border transition-all duration-200 overflow-hidden ${
        recommended
          ? 'border-emerald-500/40 bg-[#0b111c]/95 shadow-glow-emerald'
          : 'border-zinc-800/90 bg-[#0b0f17]/95 hover:border-zinc-700'
      }`}
    >
      {/* Top Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-900/50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
              recommended
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-zinc-700/80 bg-zinc-800/80 text-cyan-400'
            }`}
          >
            <IconComponent className="h-3.5 w-3.5" />
          </div>

          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">{title}</h3>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badgeStyles}`}
            >
              {badge}
            </span>
            {recommended && (
              <span className="inline-flex items-center rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 border border-emerald-400/25">
                Recommended
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onQueueAdd && (
            <button
              type="button"
              onClick={() => onQueueAdd(title, command)}
              title="Add command to Batch Queue"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-800/70 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              <ListPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Queue</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
              copied
                ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                : recommended
                ? 'bg-emerald-500/90 text-zinc-950 hover:bg-emerald-400'
                : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 hover:text-cyan-200'
            }`}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy Command
              </>
            )}
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      <div className="p-4">
        {description && (
          <p className="mb-2.5 text-xs text-zinc-400 leading-relaxed">{description}</p>
        )}

        <div className="relative rounded-xl border border-zinc-800/90 bg-[#05070b] px-4 py-3.5 overflow-x-auto">
          <div className="flex items-start gap-2.5 font-mono text-[13px] leading-relaxed">
            <span className="select-none text-zinc-600 shrink-0">$</span>
            <code className="whitespace-pre-wrap break-all select-all">
              {tokens.map((tok, idx) =>
                tok.type === 'space' ? (
                  tok.text
                ) : (
                  <span key={idx} className={TOKEN_CLASSES[tok.type] || 'text-zinc-200'}>
                    {tok.text}
                  </span>
                )
              )}
            </code>
          </div>
        </div>

        {note && (
          <p className="mt-2.5 text-[11px] text-amber-300/90 flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
