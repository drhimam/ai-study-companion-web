import { useEffect, useState } from 'react';
import { X, Cpu, Palette, Check, Download, Upload, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { Settings } from '@/types';

export function SettingsModal({
  open,
  settings,
  onClose,
  onSave,
  onExport,
  onImport,
}: {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (s: Settings) => void;
  onExport: () => void;
  onImport: () => void;
}) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setSaved(false);
    }
  }, [open, settings]);

  if (!open) return null;

  const update = (patch: Partial<Settings>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  };

  const save = () => {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-modal border border-default rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-default sticky top-0 bg-modal z-10">
          <h2 className="text-base font-semibold text-primary flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" /> Preferences & Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-white hover-surface-strong transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Managed AI Badge */}
          <div className="rounded-xl bg-gradient-to-r from-indigo-500/10 to-sky-500/10 border border-indigo-500/20 p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary">Managed AI Gateway</h3>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">
                  AI models, API keys, and endpoint configurations are securely managed by the server environment. No API key setup is required on your browser.
                </p>
              </div>
            </div>
          </div>

          {/* Theme */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5 flex items-center gap-1">
              <Palette className="w-3 h-3" /> Interface Theme
            </label>
            <div className="flex gap-2">
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => update({ theme: t })}
                  className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border capitalize transition-all ${
                    draft.theme === t
                      ? 'bg-indigo-500/15 border-indigo-400/50 text-white'
                      : 'bg-white/5 border-default text-secondary hover:border-strong'
                  }`}
                >
                  {t} Mode
                </button>
              ))}
            </div>
          </div>

          {/* Data backup */}
          <div className="border-t border-default pt-4">
            <label className="block text-xs font-medium text-muted mb-2">Chat & Study Material Backup</label>
            <div className="rounded-lg bg-amber-500/10 border border-amber-400/20 p-3 mb-3">
              <div className="flex gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  Export your study history regularly to create a local JSON backup.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onExport}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-default text-secondary text-sm font-medium hover:border-strong hover:text-white transition"
              >
                <Download className="w-3.5 h-3.5" /> Export All Data
              </button>
              <button
                onClick={onImport}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-default text-secondary text-sm font-medium hover:border-strong hover:text-white transition"
              >
                <Upload className="w-3.5 h-3.5" /> Import Data
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-default flex items-center justify-end gap-2 sticky bottom-0 bg-modal">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-secondary hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium rounded-lg transition shadow-lg shadow-indigo-500/20"
          >
            {saved ? <Check className="w-4 h-4" /> : null}
            {saved ? 'Saved' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
