import { useState } from 'react';
import { X, BarChart3 } from 'lucide-react';

export type InfographicConfig = {
  pageSize: 'A4' | 'Legal' | 'A3' | 'Letter';
  orientation: 'Landscape' | 'Portrait';
  colorPalette: 'Multicolor' | 'Greyscale' | 'Black & White';
  infographicType: 'Timelines' | 'Processes/Flowcharts' | 'Concept Maps' | 'Hierarchies' | 'Cheat Sheets' | 'Comparisons' | 'Data Charts' | 'Informational';
  instructions?: string;
};

const PAGE_SIZES: InfographicConfig['pageSize'][] = ['A4', 'Letter', 'Legal', 'A3'];
const ORIENTATIONS: InfographicConfig['orientation'][] = ['Landscape', 'Portrait'];
const PALETTES: InfographicConfig['colorPalette'][] = ['Multicolor', 'Greyscale', 'Black & White'];
const INFO_TYPES: InfographicConfig['infographicType'][] = [
  'Timelines',
  'Processes/Flowcharts',
  'Concept Maps',
  'Hierarchies',
  'Cheat Sheets',
  'Comparisons',
  'Data Charts',
  'Informational',
];

export function InfographicConfigModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (config: InfographicConfig) => void;
}) {
  const [pageSize, setPageSize] = useState<InfographicConfig['pageSize']>('A4');
  const [orientation, setOrientation] = useState<InfographicConfig['orientation']>('Landscape');
  const [colorPalette, setColorPalette] = useState<InfographicConfig['colorPalette']>('Multicolor');
  const [infographicType, setInfographicType] = useState<InfographicConfig['infographicType']>('Concept Maps');
  const [instructions, setInstructions] = useState('');

  if (!open) return null;

  const confirm = () => {
    onConfirm({ pageSize, orientation, colorPalette, infographicType, instructions: instructions.trim() || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-modal border border-default rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-default sticky top-0 bg-modal z-10">
          <h2 className="text-base font-semibold text-primary flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" /> Generate Infographic
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-white hover-surface-strong transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Page Size */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Page Size</label>
            <div className="grid grid-cols-4 gap-1.5">
              {PAGE_SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setPageSize(s)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium border transition ${
                    pageSize === s
                      ? 'bg-emerald-500/15 border-emerald-400/50 text-white'
                      : 'bg-white/5 border-default text-secondary hover:border-strong'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Orientation */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Orientation</label>
            <div className="grid grid-cols-2 gap-1.5">
              {ORIENTATIONS.map((o) => (
                <button
                  key={o}
                  onClick={() => setOrientation(o)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium border transition ${
                    orientation === o
                      ? 'bg-emerald-500/15 border-emerald-400/50 text-white'
                      : 'bg-white/5 border-default text-secondary hover:border-strong'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          {/* Color Palette */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Color Palette</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PALETTES.map((p) => (
                <button
                  key={p}
                  onClick={() => setColorPalette(p)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium border transition ${
                    colorPalette === p
                      ? 'bg-emerald-500/15 border-emerald-400/50 text-white'
                      : 'bg-white/5 border-default text-secondary hover:border-strong'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Infographic Type */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Infographic Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {INFO_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setInfographicType(t)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium border transition text-left ${
                    infographicType === t
                      ? 'bg-emerald-500/15 border-emerald-400/50 text-white'
                      : 'bg-white/5 border-default text-secondary hover:border-strong'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Instructions */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Additional Instructions <span className="text-dim">(optional)</span>
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Focus on the water cycle, include diagrams for evaporation and condensation, use examples from nature…"
              rows={3}
              className="w-full bg-white/5 border border-default rounded-lg px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-emerald-400/40 transition resize-none"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-default flex items-center justify-end gap-2 sticky bottom-0 bg-modal">
          <button onClick={onClose} className="px-4 py-2 text-sm text-secondary hover:text-white transition">Cancel</button>
          <button
            onClick={confirm}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium rounded-lg transition shadow-lg shadow-emerald-500/20"
          >
            Generate Infographic
          </button>
        </div>
      </div>
    </div>
  );
}
