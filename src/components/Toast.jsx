import React from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export function ToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((toast) => {
        const isWarning = toast.type === 'warning';
        const isInfo = toast.type === 'info';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md transition-all duration-200 ${
              isWarning
                ? 'bg-amber-950/90 border-amber-500/40 text-amber-100'
                : isInfo
                ? 'bg-zinc-900/95 border-cyan-500/40 text-zinc-100'
                : 'bg-zinc-900/95 border-emerald-500/40 text-zinc-100 shadow-glow-emerald'
            }`}
          >
            <span className="mt-0.5 shrink-0">
              {isWarning ? (
                <AlertTriangle className="h-4 w-4 text-amber-400" />
              ) : isInfo ? (
                <Info className="h-4 w-4 text-cyan-400" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              )}
            </span>
            <div className="flex-1 min-w-0">
              {toast.title && (
                <p className="text-xs font-semibold tracking-tight text-white">{toast.title}</p>
              )}
              <p className="text-xs text-zinc-300 leading-relaxed break-words">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
