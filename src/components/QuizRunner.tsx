import { useState } from 'react';
import { CheckCircle2, XCircle, RotateCcw, ChevronRight, Award } from 'lucide-react';
import type { QuizContent, QuizQuestion } from '@/types';

type AnswerMap = Record<string, number[] | string>;

export function QuizRunner({
  quiz,
  onClose,
}: {
  quiz: { title: string; content: QuizContent };
  onClose: () => void;
}) {
  const { questions } = quiz.content;
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitted, setSubmitted] = useState(false);
  const [current, setCurrent] = useState(0);

  const q = questions[Math.min(current, questions.length - 1)];

  const setAnswer = (qid: string, val: number[] | string) => {
    setAnswers((a) => ({ ...a, [qid]: val }));
  };

  const toggleMulti = (qid: string, idx: number) => {
    setAnswers((a) => {
      const prev = (a[qid] as number[]) || [];
      return { ...a, [qid]: prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx].sort() };
    });
  };

  const score = () => {
    let correct = 0;
    for (const question of questions) {
      const ans = answers[question.id];
      if (question.type === 'short') {
        if (typeof ans === 'string' && ans.trim() && typeof question.correct === 'string') {
          const model = question.correct.toLowerCase();
          if (ans.trim().toLowerCase().includes(model.slice(0, 20)) || model.includes(ans.trim().toLowerCase().slice(0, 20))) {
            correct++;
          }
        }
      } else {
        if (Array.isArray(ans) && Array.isArray(question.correct) && arraysEqual(ans, question.correct)) correct++;
      }
    }
    return correct;
  };

  const totalAnswered = Object.keys(answers).filter((k) => {
    const v = answers[k];
    return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim().length > 0;
  }).length;

  if (!q) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted">This quiz has no questions.</p>
        <button onClick={onClose} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300">Back to study materials</button>
      </div>
    );
  }

  if (submitted) {
    const correct = score();
    const pct = Math.round((correct / questions.length) * 100);
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-center mb-6">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-3 ${pct >= 70 ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
            <Award className={`w-8 h-8 ${pct >= 70 ? 'text-emerald-400' : 'text-amber-400'}`} />
          </div>
          <h2 className="text-xl font-bold text-primary">{pct}%</h2>
          <p className="text-sm text-muted">{correct} of {questions.length} correct</p>
        </div>

        <div className="space-y-3 mb-6">
          {questions.map((question, i) => {
            const ans = answers[question.id];
            const isCorrect = question.type === 'short'
              ? typeof ans === 'string' && ans.trim() && typeof question.correct === 'string' && question.correct.toLowerCase().includes(ans.trim().toLowerCase().slice(0, 20))
              : Array.isArray(ans) && Array.isArray(question.correct) && arraysEqual(ans, question.correct);
            return (
              <div key={question.id} className={`rounded-xl border p-4 ${isCorrect ? 'bg-emerald-500/5 border-emerald-400/30' : 'bg-rose-500/5 border-rose-400/30'}`}>
                <div className="flex items-start gap-2 mb-2">
                  {isCorrect ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />}
                  <p className="text-sm font-medium text-primary">{i + 1}. {question.question}</p>
                </div>
                <div className="text-xs text-muted ml-6 space-y-1">
                  {question.type !== 'short' && Array.isArray(question.correct) && (
                    <>
                      <p>Correct: {question.correct.map((c) => String.fromCharCode(65 + c)).join(', ')}</p>
                      {Array.isArray(ans) && ans.length > 0 && (
                        <p>Your answer: {ans.map((c) => String.fromCharCode(65 + c)).join(', ') || 'Not answered'}</p>
                      )}
                    </>
                  )}
                  {question.type === 'short' && typeof question.correct === 'string' && (
                    <>
                      <p>Model answer: {question.correct}</p>
                      <p>Your answer: {(ans as string) || 'Not answered'}</p>
                    </>
                  )}
                  {question.explanation && <p className="text-muted mt-1">Explanation: {question.explanation}</p>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { setAnswers({}); setSubmitted(false); setCurrent(0); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-default text-secondary hover:text-primary hover-surface-strong rounded-lg text-sm transition"
          >
            <RotateCcw className="w-4 h-4" /> Retake
          </button>
          <button onClick={onClose} className="px-4 py-2 text-secondary hover:text-primary text-sm transition">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-primary">{quiz.title}</h2>
        <span className="text-xs text-muted">{totalAnswered}/{questions.length} answered</span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden mb-6">
        <div className="h-full bg-indigo-400 rounded-full transition-all" style={{ width: `${(totalAnswered / questions.length) * 100}%` }} />
      </div>

      <div className="bg-white/5 border border-default rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 font-medium">
            {q.type === 'mcq' ? 'Single choice' : q.type === 'multi' ? 'Multi-select' : 'Short answer'}
          </span>
          <span className="text-xs text-muted">Question {current + 1} of {questions.length}</span>
        </div>
        <p className="text-sm font-medium text-primary mb-4">{q.question}</p>

        {q.type === 'short' ? (
          <textarea
            value={(answers[q.id] as string) || ''}
            onChange={(e) => setAnswer(q.id, e.target.value)}
            placeholder="Type your answer..."
            rows={3}
            className="w-full px-3 py-2 bg-white/5 border border-default rounded-lg text-primary placeholder:text-muted text-sm focus:outline-none focus:border-indigo-400/50 resize-none"
          />
        ) : (
          <div className="space-y-2">
            {q.options.map((opt, idx) => {
              const selected = q.type === 'mcq'
                ? Array.isArray(answers[q.id]) && (answers[q.id] as number[])[0] === idx
                : Array.isArray(answers[q.id]) && (answers[q.id] as number[]).includes(idx);
              return (
                <button
                  key={idx}
                  onClick={() => q.type === 'mcq' ? setAnswer(q.id, [idx]) : toggleMulti(q.id, idx)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition flex items-center gap-2.5 ${
                    selected
                      ? 'bg-indigo-500/15 border-indigo-400/50 text-primary'
                      : 'bg-white/5 border-default text-secondary hover:border-strong'
                  }`}
                >
                  <span className={`w-5 h-5 flex-shrink-0 flex items-center justify-center text-xs font-semibold border rounded ${
                    selected ? 'bg-indigo-500 border-indigo-400 text-primary' : 'border-strong text-muted'
                  }`}>
                    {q.type === 'multi' ? (selected ? '✓' : '') : String.fromCharCode(65 + idx)}
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4">
        <button
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="px-3 py-2 text-sm text-secondary hover:text-primary disabled:opacity-40 transition"
        >
          Previous
        </button>
        {current < questions.length - 1 ? (
          <button
            onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
            className="flex items-center gap-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-primary text-sm font-medium rounded-lg transition"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => setSubmitted(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-primary text-sm font-medium rounded-lg transition shadow-lg shadow-emerald-500/20"
          >
            <CheckCircle2 className="w-4 h-4" /> Submit Quiz
          </button>
        )}
      </div>
    </div>
  );
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
