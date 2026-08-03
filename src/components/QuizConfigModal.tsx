import { useState } from 'react';
import { X, Target } from 'lucide-react';

export type QuizConfig = {
  count: number;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  types: { mcq: number; multi: number; short: number };
};

export function QuizConfigModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (config: QuizConfig) => void;
}) {
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<QuizConfig['difficulty']>('Medium');
  const [mcq, setMcq] = useState(60);
  const [multi, setMulti] = useState(20);
  const [short, setShort] = useState(20);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const total = mcq + multi + short;

  const confirm = () => {
    if (total !== 100) {
      setError('Type percentages must add up to 100%.');
      return;
    }
    if (count < 1 || count > 50) {
      setError('Question count must be between 1 and 50.');
      return;
    }
    onConfirm({ count, difficulty, types: { mcq, multi, short } });
  };

  const adjustPct = (setter: (n: number) => void, val: number) => {
    setter(Math.max(0, Math.min(100, val)));
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-modal border border-default rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-default">
          <h2 className="text-base font-semibold text-primary flex items-center gap-2">
            <Target className="w-4 h-4 text-indigo-400" /> Generate Quiz
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-white hover-surface-strong transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Count */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Number of questions: <span className="text-indigo-300 font-semibold">{count}</span>
            </label>
            <input
              type="range"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-muted mt-0.5">
              <span>1</span><span>50</span>
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Difficulty</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['Easy', 'Medium', 'Hard', 'Expert'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition ${
                    difficulty === d
                      ? 'bg-indigo-500/15 border-indigo-400/50 text-white'
                      : 'bg-white/5 border-default text-secondary hover:border-strong'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Types */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Question types <span className={total === 100 ? 'text-emerald-400' : 'text-amber-400'}>({total}%)</span>
            </label>
            <div className="space-y-2.5">
              <TypeRow label="Single best MCQ" value={mcq} onChange={(v) => adjustPct(setMcq, v)} color="indigo" />
              <TypeRow label="Multi-select MCQ" value={multi} onChange={(v) => adjustPct(setMulti, v)} color="sky" />
              <TypeRow label="Short answer" value={short} onChange={(v) => adjustPct(setShort, v)} color="emerald" />
            </div>
          </div>

          {error && (
            <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-default flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-secondary hover:text-white transition">Cancel</button>
          <button
            onClick={confirm}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium rounded-lg transition shadow-lg shadow-indigo-500/20"
          >
            Generate Quiz
          </button>
        </div>
      </div>
    </div>
  );
}

function TypeRow({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: 'indigo' | 'sky' | 'emerald';
}) {
  const barColor = { indigo: 'bg-indigo-400', sky: 'bg-sky-400', emerald: 'bg-emerald-400' }[color];
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-secondary">{label}</span>
        <span className="text-muted font-mono">{value}%</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${value}%` }} />
        </div>
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-12 px-1.5 py-0.5 bg-white/5 border border-default rounded text-primary text-xs text-center focus:outline-none focus:border-indigo-400/50"
        />
      </div>
    </div>
  );
}
