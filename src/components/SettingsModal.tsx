import { useEffect, useState } from 'react';
import { X, KeyRound, Cpu, Palette, ExternalLink, Check, Download, Upload, AlertTriangle } from 'lucide-react';
import { PROVIDERS } from '@/lib/providers';
import type { ProviderId, Settings } from '@/types';

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

  const provider = PROVIDERS[draft.provider];

  const update = (patch: Partial<Settings>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  };

  const onProviderChange = (id: ProviderId) => {
    const p = PROVIDERS[id];
    setDraft((d) => ({
      ...d,
      provider: id,
      model: p.defaultModel,
      customModel: '',
      customBaseUrl: id === 'custom' ? p.baseUrl : d.customBaseUrl,
    }));
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
            <Cpu className="w-4 h-4 text-indigo-400" /> AI Provider Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-white hover-surface-strong transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Provider */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">AI Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(PROVIDERS).map((p) => (
                <button
                  key={p.id}
                  onClick={() => onProviderChange(p.id)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all text-left ${
                    draft.provider === p.id
                      ? 'bg-indigo-500/15 border-indigo-400/50 text-white'
                      : 'bg-white/5 border-default text-secondary hover:border-strong'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Model</label>
            <select
              value={draft.model}
              onChange={(e) => update({ model: e.target.value })}
              className="w-full px-3 py-2.5 bg-white/5 border border-default rounded-lg text-primary text-sm focus:outline-none focus:border-indigo-400/50"
            >
              {provider.models.map((m) => (
                <option key={m} value={m} className="bg-modal">
                  {m}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={draft.customModel}
              onChange={(e) => update({ customModel: e.target.value })}
              placeholder="Or type a custom model name"
              className="w-full mt-2 px-3 py-2 bg-white/5 border border-default rounded-lg text-primary placeholder:text-muted text-sm focus:outline-none focus:border-indigo-400/50"
            />
          </div>

          {/* API key */}
          {draft.provider !== 'custom' && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5 flex items-center gap-1">
                <KeyRound className="w-3 h-3" /> API Key
              </label>
              <input
                type="password"
                value={draft.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-3 py-2.5 bg-white/5 border border-default rounded-lg text-primary placeholder:text-muted text-sm focus:outline-none focus:border-indigo-400/50 font-mono"
              />
              {provider.apiKeyUrl && (
                <a
                  href={provider.apiKeyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 mt-1.5"
                >
                  Get an API key <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {/* Custom endpoint */}
          {draft.provider === 'custom' && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                Custom Endpoint URL
              </label>
              <input
                type="text"
                value={draft.customBaseUrl}
                onChange={(e) => update({ customBaseUrl: e.target.value })}
                placeholder="http://localhost:11434/v1"
                className="w-full px-3 py-2.5 bg-white/5 border border-default rounded-lg text-primary placeholder:text-muted text-sm focus:outline-none focus:border-indigo-400/50 font-mono"
              />
              <p className="text-xs text-muted mt-1.5">
                Any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, etc.).
              </p>
            </div>
          )}

          {/* Theme */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5 flex items-center gap-1">
              <Palette className="w-3 h-3" /> Theme
            </label>
            <div className="flex gap-2">
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => update({ theme: t })}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border capitalize transition-all ${
                    draft.theme === t
                      ? 'bg-indigo-500/15 border-indigo-400/50 text-white'
                      : 'bg-white/5 border-default text-secondary hover:border-strong'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Data backup */}
          <div className="border-t border-default pt-4">
            <label className="block text-xs font-medium text-muted mb-2">Chat History Backup</label>
            <div className="rounded-lg bg-amber-500/10 border border-amber-400/20 p-3 mb-3">
              <div className="flex gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  Your chat messages are stored only in this browser. Clearing browser data or switching browsers will erase them. Export regularly to keep a backup.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onExport}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-default text-secondary text-sm font-medium hover:border-strong hover:text-white transition"
              >
                <Download className="w-3.5 h-3.5" /> Export All
              </button>
              <button
                onClick={onImport}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-default text-secondary text-sm font-medium hover:border-strong hover:text-white transition"
              >
                <Upload className="w-3.5 h-3.5" /> Import
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
