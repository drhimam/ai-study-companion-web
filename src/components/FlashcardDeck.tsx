import { useState, useCallback, useEffect } from 'react';
import { Layers, ChevronLeft, ChevronRight, RotateCcw, Sparkles, Lightbulb, Sigma } from 'lucide-react';
import type { Flashcard, SimpleFlashcard } from '@/types';

type CardWithStatus = (SimpleFlashcard & { id: string; status?: Flashcard['status'] });

export function FlashcardDeck({
  cards,
  onUpdateStatus,
  onDelete,
}: {
  cards: CardWithStatus[];
  onUpdateStatus?: (id: string, status: Flashcard['status']) => void;
  onDelete?: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const go = useCallback((dir: number) => {
    setFlipped(false);
    setIndex((i) => Math.max(0, Math.min(cards.length - 1, i + dir)));
  }, [cards.length]);

  const flip = useCallback(() => setFlipped((f) => !f), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [go, flip]);

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
          <Layers className="w-8 h-8 text-muted" />
        </div>
        <h3 className="text-sm font-semibold text-secondary">No flashcards in this deck</h3>
      </div>
    );
  }

  const card = cards[Math.min(index, cards.length - 1)];
  const hasStatus = onUpdateStatus !== undefined && card.status !== undefined;
  const gotIt = hasStatus ? cards.filter((c) => c.status === 'got_it').length : 0;
  const progress = hasStatus ? Math.round((gotIt / cards.length) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar */}
      <div className="px-6 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-muted tracking-wide">
            {String(index + 1).padStart(2, '0')} <span className="text-dim">/ {String(cards.length).padStart(2, '0')}</span>
          </span>
          {hasStatus && <span className="text-xs text-emerald-400 font-bold">{progress}% mastered</span>}
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400 rounded-full transition-all duration-500"
            style={{ width: `${((index + 1) / cards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center px-4 py-4" style={{ perspective: '1400px' }}>
        <div
          onClick={flip}
          className="relative w-full max-w-2xl cursor-pointer select-none"
          style={{ minHeight: '420px', transformStyle: 'preserve-3d', transition: 'transform 0.7s cubic-bezier(0.4,0,0.2,1)', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* Front face */}
          <div
            className="flashcard-front absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-600/30 via-indigo-500/15 to-sky-500/20 border-2 border-indigo-400/40 p-7 flex flex-col shadow-2xl"
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', boxShadow: '0 20px 60px -15px rgba(79,70,229,0.3)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-indigo-300" />
              </div>
              <span className="text-[11px] uppercase tracking-widest text-indigo-300 font-bold">Concept</span>
            </div>
            <div className="flex-1 flex items-center justify-center text-center">
              <p className="text-3xl font-bold text-white leading-tight">{card.front}</p>
            </div>
            <div className="text-[11px] text-muted mt-3 text-center font-medium">Tap or press Space to flip</div>
          </div>

          {/* Back face */}
          <div
            className="flashcard-back absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-600/30 via-teal-500/15 to-cyan-500/20 border-2 border-emerald-400/40 p-7 flex flex-col overflow-y-auto"
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', boxShadow: '0 20px 60px -15px rgba(16,185,129,0.3)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/30 flex items-center justify-center">
                <Layers className="w-4 h-4 text-emerald-300" />
              </div>
              <span className="text-[11px] uppercase tracking-widest text-emerald-300 font-bold">Definition</span>
            </div>
            <p className="text-lg font-semibold text-white leading-relaxed">{card.back}</p>
            {card.analogy && (
              <div className="mt-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-400/20">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">Analogy</span>
                </div>
                <p className="text-sm text-primary leading-relaxed">{card.analogy}</p>
              </div>
            )}
            {card.formula && card.formula !== 'N/A' && (
              <div className="mt-3 p-3 rounded-2xl bg-sky-500/10 border border-sky-400/20">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sigma className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-[10px] uppercase tracking-wider text-sky-300 font-bold">Formula</span>
                </div>
                <p className="text-sm text-primary font-mono">{card.formula}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-6 py-4 space-y-3">
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => go(-1)}
            disabled={index === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/5 border border-default text-secondary hover:text-white hover-surface-strong disabled:opacity-30 disabled:cursor-not-allowed transition font-medium text-sm"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <button
            onClick={flip}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 text-white font-bold text-sm hover:from-indigo-400 hover:to-sky-400 transition shadow-lg"
          >
            Flip
          </button>
          <button
            onClick={() => go(1)}
            disabled={index === cards.length - 1}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/5 border border-default text-secondary hover:text-white hover-surface-strong disabled:opacity-30 disabled:cursor-not-allowed transition font-medium text-sm"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-1.5">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => { setFlipped(false); setIndex(i); }}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-indigo-400' : 'w-1.5 bg-white/15 hover:bg-white/30'}`}
            />
          ))}
        </div>

        {hasStatus && onUpdateStatus && (
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              onClick={() => onUpdateStatus(card.id, 'hard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                card.status === 'hard'
                  ? 'bg-amber-500/25 border-amber-400/50 text-amber-300'
                  : 'bg-white/5 border-default text-secondary hover:bg-amber-500/10 hover:border-amber-400/30'
              }`}
            >
              Still Learning
            </button>
            <button
              onClick={() => onUpdateStatus(card.id, 'got_it')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                card.status === 'got_it'
                  ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-300'
                  : 'bg-white/5 border-default text-secondary hover:bg-emerald-500/10 hover:border-emerald-400/30'
              }`}
            >
              Got It
            </button>
            <button
              onClick={() => onUpdateStatus(card.id, 'new')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-white/5 border-default text-secondary hover-surface-strong transition"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>
        )}
        {hasStatus && onDelete && (
          <button
            onClick={() => onDelete(card.id)}
            className="w-full text-xs text-muted hover:text-rose-400 transition py-1"
          >
            Delete this card
          </button>
        )}
      </div>
    </div>
  );
}
