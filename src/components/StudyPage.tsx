import { useState, useRef, useEffect, forwardRef } from 'react';
import { toPng } from 'html-to-image';
import { Printer } from 'lucide-react';
import {
  Layers,
  Target,
  FileText,
  BarChart3,
  Bookmark,
  Pencil,
  Trash2,
  Download,
  Eye,
  X,
  Check,
  MoreVertical,
  FileDown,
  ClipboardList,
  ImageDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { Flashcard, StudyMaterial, MaterialType, QuizContent, FlashcardDeckContent, SavedContent, SimpleFlashcard, AssignmentContent } from '@/types';
import { FlashcardDeck } from '@/components/FlashcardDeck';
import { QuizRunner } from '@/components/QuizRunner';
import { renderMarkdown } from '@/components/Markdown';

type ViewItem =
  | { kind: 'quiz'; material: StudyMaterial }
  | { kind: 'note'; material: StudyMaterial }
  | { kind: 'infographic'; material: StudyMaterial }
  | { kind: 'flashcard_deck'; material: StudyMaterial }
  | { kind: 'saved'; material: StudyMaterial }
  | { kind: 'assignment'; material: StudyMaterial };

export function StudyPage({
  materials,
  onRenameMaterial,
  onDeleteMaterial,
  onEditMaterial,
}: {
  materials: StudyMaterial[];
  onRenameMaterial: (id: string, title: string) => void;
  onDeleteMaterial: (id: string) => void;
  onEditMaterial: (id: string, title: string, content: string) => void;
}) {
  const [tab, setTab] = useState<MaterialType>('flashcard_deck');
  const [viewing, setViewing] = useState<ViewItem | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const infographicRef = useRef<HTMLIFrameElement>(null);
  const [pngBusy, setPngBusy] = useState(false);

  const decks = materials.filter((m) => m.type === 'flashcard_deck');
  const deckIndex = viewing?.kind === 'flashcard_deck' ? decks.findIndex((d) => d.id === viewing.material.id) : -1;

  const goToDeck = (dir: 1 | -1) => {
    if (deckIndex < 0) return;
    const nextIdx = deckIndex + dir;
    if (nextIdx < 0 || nextIdx >= decks.length) return;
    const dc = decks[nextIdx].content as unknown as FlashcardDeckContent;
    setViewing({ kind: 'flashcard_deck', material: decks[nextIdx] });
  };
  const quizzes = materials.filter((m) => m.type === 'quiz');
  const notes = materials.filter((m) => m.type === 'note');
  const infographics = materials.filter((m) => m.type === 'infographic');
  const saved = materials.filter((m) => m.type === 'saved');
  const assignments = materials.filter((m) => m.type === 'assignment');

  const tabs: { id: MaterialType; label: string; icon: typeof Layers; count: number }[] = [
    { id: 'flashcard_deck', label: 'Flashcards', icon: Layers, count: decks.length },
    { id: 'quiz', label: 'Quizzes', icon: Target, count: quizzes.length },
    { id: 'note', label: 'Study Notes', icon: FileText, count: notes.length },
    { id: 'infographic', label: 'Infographics', icon: BarChart3, count: infographics.length },
    { id: 'assignment', label: 'Assignments', icon: ClipboardList, count: assignments.length },
    { id: 'saved', label: 'Saved', icon: Bookmark, count: saved.length },
  ];

  const downloadMaterial = (m: StudyMaterial) => {
    let text = m.title;
    let ext = 'txt';
    let mime = 'text/plain';
    if (m.type === 'quiz') {
      const qc = m.content as QuizContent;
      text = qc.questions.map((q, i) => {
        const header = `Q${i + 1} (${q.type}): ${q.question}`;
        const opts = q.type !== 'short' ? q.options.map((o, j) => `${String.fromCharCode(65 + j)}) ${o}`).join('\n') : '';
        const correct = q.type === 'short' ? `Answer: ${q.correct}` : `Correct: ${(q.correct as number[]).map((c: number) => String.fromCharCode(65 + c)).join(', ')}`;
        return `${header}\n${opts}\n${correct}\nExplanation: ${q.explanation}\n`;
      }).join('\n');
    } else if (m.type === 'flashcard_deck') {
      const dc = m.content as unknown as FlashcardDeckContent;
      text = dc.cards.map((c, i) => `Card ${i + 1}\nFront: ${c.front}\nBack: ${c.back}\n${c.analogy ? 'Analogy: ' + c.analogy + '\n' : ''}${c.formula ? 'Formula: ' + c.formula + '\n' : ''}`).join('\n');
    } else if (m.type === 'saved') {
      const sc = m.content as unknown as SavedContent;
      text = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${m.title}</title><style>body{font-family:Inter,system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#0f172a;line-height:1.6} table{border-collapse:collapse;width:100%} th,td{border:1px solid #e2e8f0;padding:8px 12px} th{background:#f1f5f9} code{background:#f1f5f9;padding:2px 4px;border-radius:4px} pre{background:#f8fafc;padding:12px;border-radius:8px;overflow-x:auto} h1,h2,h3{line-height:1.3}</style></head><body>${renderMarkdown(sc.text)}</body></html>`;
      ext = 'html';
      mime = 'text/html';
    } else if (m.type === 'assignment') {
      const ac = m.content as unknown as AssignmentContent;
      text = ac.text;
      ext = 'md';
      mime = 'text/markdown';
    } else {
      const c = m.content as { html: string };
      text = c.html;
      ext = 'html';
      mime = 'text/html';
    }
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(m.title)}_${timestamp()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startRename = (m: StudyMaterial) => {
    setRenamingId(m.id);
    setRenameVal(m.title);
    setMenuOpen(null);
  };

  const confirmRename = (id: string) => {
    onRenameMaterial(id, renameVal.trim() || 'Untitled');
    setRenamingId(null);
  };

  const startEdit = (m: StudyMaterial) => {
    if (m.type !== 'flashcard_deck') return;
    setEditingId(m.id);
    setEditError(null);
    setEditVal(JSON.stringify(m.content as unknown as FlashcardDeckContent, null, 2));
    setMenuOpen(null);
  };

  const confirmEdit = (id: string) => {
    const m = materials.find((x) => x.id === id);
    if (!m || m.type !== 'flashcard_deck') return;

    let parsed: FlashcardDeckContent;
    try {
      parsed = JSON.parse(editVal) as FlashcardDeckContent;
    } catch {
      setEditError('Invalid JSON. Please check the format and try again.');
      return;
    }

    if (!parsed.cards || !Array.isArray(parsed.cards) || parsed.cards.length < 1 || parsed.cards.length > 200) {
      setEditError('A flashcard deck must contain between 1 and 200 cards.');
      return;
    }

    for (const card of parsed.cards) {
      if (!card.front || !card.back || typeof card.front !== 'string' || typeof card.back !== 'string') {
        setEditError('Each card needs a front and back text field.');
        return;
      }
      if (card.front.length > 2000 || card.back.length > 2000) {
        setEditError('Card text cannot exceed 2000 characters.');
        return;
      }
    }

    const totalSize = new Blob([editVal]).size;
    if (totalSize > 262144) {
      setEditError('Content too large. Please reduce the number of cards or text length.');
      return;
    }

    setEditError(null);
    onEditMaterial(id, m.title, editVal);
    setEditingId(null);
  };

  const iconForType = (type: MaterialType) => {
    if (type === 'quiz') return <Target className="w-4 h-4 text-indigo-300" />;
    if (type === 'note') return <FileText className="w-4 h-4 text-sky-300" />;
    if (type === 'infographic') return <BarChart3 className="w-4 h-4 text-emerald-300" />;
    if (type === 'flashcard_deck') return <Layers className="w-4 h-4 text-amber-300" />;
    if (type === 'assignment') return <ClipboardList className="w-4 h-4 text-sky-300" />;
    return <Bookmark className="w-4 h-4 text-violet-300" />;
  };

  const subtitleForType = (m: StudyMaterial) => {
    if (m.type === 'quiz') return `${(m.content as QuizContent).questions.length} questions`;
    if (m.type === 'flashcard_deck') return `${(m.content as unknown as FlashcardDeckContent).cards.length} cards`;
    if (m.type === 'saved') return 'Saved response';
    if (m.type === 'assignment') return 'Assignment sheet';
    return 'HTML document';
  };

  const downloadDeckPdf = (material: StudyMaterial) => {
    const dc = material.content as unknown as FlashcardDeckContent;
    const cards: SimpleFlashcard[] = dc.cards;
    const cardHtml = cards.map((c, i) => `
      <div class="flashcard">
        <div class="face front">
          <div class="badge front-badge">Q</div>
          <div class="card-num">${i + 1}</div>
          <div class="face-content">${escapeHtml(c.front)}</div>
          <div class="cut-hint">✂ cut along this line</div>
        </div>
        <div class="face back">
          <div class="badge back-badge">A</div>
          <div class="card-num">${i + 1}</div>
          <div class="face-content">${escapeHtml(c.back)}</div>
          ${c.analogy ? `<div class="extra analogy"><span class="extra-tag">Analogy</span>${escapeHtml(c.analogy)}</div>` : ''}
          ${c.formula && c.formula !== 'N/A' ? `<div class="extra formula"><span class="extra-tag">Formula</span><code>${escapeHtml(c.formula)}</code></div>` : ''}
        </div>
      </div>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(material.title)}</title>
      <style>
        @page { size: A4; margin: 8mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #1e293b; }
        .header { text-align: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px dashed #cbd5e1; }
        .header h1 { font-size: 18px; font-weight: 800; color: #4f46e5; }
        .header p { font-size: 10px; color: #64748b; margin-top: 2px; }
        .instructions { font-size: 9px; color: #94a3b8; margin-top: 4px; }
        .flashcard { display: flex; border: 2px solid #4f46e5; border-radius: 12px; overflow: hidden; margin-bottom: 8mm; break-inside: avoid; }
        .face { width: 50%; min-height: 80mm; padding: 16px 18px; position: relative; display: flex; flex-direction: column; }
        .front { background: linear-gradient(135deg, #eef2ff, #e0f2fe); border-right: 2px dashed #94a3b8; }
        .back { background: linear-gradient(135deg, #ecfdf5, #f0fdfa); }
        .badge { position: absolute; top: 10px; left: 10px; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: #fff; }
        .front-badge { background: #4f46e5; }
        .back-badge { background: #10b981; }
        .card-num { position: absolute; top: 12px; right: 14px; font-size: 10px; font-weight: 700; color: #94a3b8; }
        .face-content { margin-top: 28px; font-size: 14px; line-height: 1.5; flex: 1; }
        .front .face-content { font-weight: 700; color: #3730a3; }
        .back .face-content { font-weight: 600; color: #064e3b; }
        .extra { font-size: 10px; padding: 6px 8px; border-radius: 6px; margin-top: 6px; line-height: 1.4; }
        .extra.analogy { background: #fef3c7; border: 1px solid #fde68a; color: #78350f; }
        .extra.formula { background: #e0f2fe; border: 1px solid #bae6fd; color: #0c4a6e; }
        .extra-tag { display: inline-block; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-right: 4px; }
        code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 10px; }
        .cut-hint { font-size: 8px; color: #94a3b8; text-align: center; margin-top: 8px; font-style: italic; }
      </style></head><body>
      <div class="header">
        <h1>${escapeHtml(material.title)}</h1>
        <p>${cards.length} flashcards · ${new Date(material.created_at).toLocaleDateString()}</p>
        <p class="instructions">Print, then cut along the dashed center line and fold each card so the question (Q) is on one side and the answer (A) on the other.</p>
      </div>
      ${cardHtml}
      </body></html>`;
    printHtmlAsPdf(html, `${slugify(material.title)}_${timestamp()}`);
  };

  const downloadInfographicPng = async (material: StudyMaterial) => {
    const iframe = infographicRef.current;
    if (!iframe || pngBusy) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    setPngBusy(true);
    try {
      const body = doc.body;
      const dataUrl = await toPng(body, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff',
        width: body.scrollWidth,
        height: body.scrollHeight,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${slugify(material.title)}_${timestamp()}.png`;
      a.click();
    } catch {
      const c = material.content as { html: string };
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(material.title)}</title><style>body{margin:0;overflow:auto}</style></head><body>${sanitizeInfographicHtml(c.html)}</body></html>`;
      printHtmlAsPdf(html, slugify(material.title));
    } finally {
      setPngBusy(false);
    }
  };

  const printInfographic = (material: StudyMaterial) => {
    const iframe = infographicRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      return;
    }
    const c = material.content as { html: string };
    printHtmlAsPdf(sanitizeInfographicHtml(c.html), slugify(material.title));
  };

  if (viewing) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-panel border-b border-default px-4 py-2.5 flex items-center justify-between">
          <span className="text-sm font-medium text-primary truncate">{viewing.material.title}</span>
          <div className="flex items-center gap-1">
            {viewing.kind === 'flashcard_deck' && (
              <>
                <button onClick={() => downloadDeckPdf(viewing.material)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-300 hover:text-white hover:bg-indigo-500/15 transition">
                  <FileDown className="w-3.5 h-3.5" /> PDF
                </button>
                {decks.length > 1 && (
                  <div className="flex items-center gap-0.5 ml-1 pl-2 border-l border-default">
                    <button
                      onClick={() => goToDeck(-1)}
                      disabled={deckIndex <= 0}
                      className="p-1.5 rounded-lg text-muted hover:text-white hover-surface-strong transition disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Previous deck"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-[11px] text-muted px-1">{deckIndex + 1} / {decks.length}</span>
                    <button
                      onClick={() => goToDeck(1)}
                      disabled={deckIndex >= decks.length - 1}
                      className="p-1.5 rounded-lg text-muted hover:text-white hover-surface-strong transition disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Next deck"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            )}
            {viewing.kind === 'infographic' && (
              <>
                <button onClick={() => printInfographic(viewing.material)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-sky-300 hover:text-white hover:bg-sky-500/15 transition">
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button onClick={() => downloadInfographicPng(viewing.material)} disabled={pngBusy} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-300 hover:text-white hover:bg-emerald-500/15 transition disabled:opacity-50">
                  <ImageDown className="w-3.5 h-3.5" /> {pngBusy ? 'Saving…' : 'PNG'}
                </button>
              </>
            )}
            <button onClick={() => setViewing(null)} className="p-1.5 rounded-lg text-muted hover:text-white hover-surface-strong transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {viewing.kind === 'quiz' ? (
          <QuizRunner
            quiz={{ title: viewing.material.title, content: viewing.material.content as QuizContent }}
            onClose={() => setViewing(null)}
          />
        ) : viewing.kind === 'flashcard_deck' ? (
          <FlashcardDeck cards={(viewing.material.content as unknown as FlashcardDeckContent).cards.map((c) => ({ ...c, id: viewing.material.id, status: 'new' as Flashcard['status'] }))} />
        ) : viewing.kind === 'saved' ? (
          <div className="p-4">
            <div
              className="md-body rounded-xl border border-default bg-white p-6"
              dangerouslySetInnerHTML={{ __html: renderMarkdown((viewing.material.content as unknown as SavedContent).text) }}
            />
          </div>
        ) : viewing.kind === 'assignment' ? (
          <div className="p-4">
            <div
              className="md-body rounded-xl border border-default bg-white p-6"
              dangerouslySetInnerHTML={{ __html: renderMarkdown((viewing.material.content as unknown as AssignmentContent).text) }}
            />
          </div>
        ) : (
          <InfographicViewer
            ref={infographicRef}
            html={sanitizeInfographicHtml((viewing.material.content as { html: string }).html)}
          />
        )}
      </div>
    );
  }

  if (editingId) {
    const m = materials.find((x) => x.id === editingId);
    const editSize = new Blob([editVal]).size;
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="sticky top-0 z-10 bg-panel border-b border-default px-4 py-2.5 flex items-center justify-between">
          <span className="text-sm font-medium text-primary">Edit: {m?.title}</span>
          <div className="flex gap-2">
            <button onClick={() => { setEditingId(null); setEditError(null); }} className="px-3 py-1.5 text-sm text-secondary hover:text-white transition">Cancel</button>
            <button onClick={() => confirmEdit(editingId)} className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white text-sm rounded-lg transition flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </div>
        {editError && (
          <div className="px-4 py-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-300 text-xs">
            {editError}
          </div>
        )}
        <textarea
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          className="flex-1 w-full bg-app text-primary text-sm font-mono p-4 resize-none focus:outline-none"
          spellCheck={false}
        />
        <div className="px-4 py-1.5 border-t border-default text-[11px] text-muted flex justify-between">
          <span>JSON format · cards array with front/back text</span>
          <span>{editSize > 262144 ? <span className="text-rose-400">{(editSize / 1024).toFixed(0)} KB / 256 KB</span> : `${(editSize / 1024).toFixed(1)} KB / 256 KB`}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex gap-1 px-4 pt-3 pb-2 border-b border-default overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
              tab === t.id ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-400/30' : 'text-muted hover:text-white hover-surface border border-transparent'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
            <span className={`text-[10px] px-1.5 rounded-full ${tab === t.id ? 'bg-indigo-500/30' : 'bg-white/5'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
          {materials.filter((m) => m.type === tab).length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                  {tab === 'quiz' && <Target className="w-7 h-7 text-muted" />}
                  {tab === 'note' && <FileText className="w-7 h-7 text-muted" />}
                  {tab === 'infographic' && <BarChart3 className="w-7 h-7 text-muted" />}
                  {tab === 'flashcard_deck' && <Layers className="w-7 h-7 text-muted" />}
                  {tab === 'assignment' && <ClipboardList className="w-7 h-7 text-muted" />}
                  {tab === 'saved' && <Bookmark className="w-7 h-7 text-muted" />}
                </div>
                <h3 className="text-sm font-semibold text-secondary">
                  No {tab === 'quiz' ? 'quizzes' : tab === 'note' ? 'study notes' : tab === 'infographic' ? 'infographics' : tab === 'flashcard_deck' ? 'flashcards' : tab === 'assignment' ? 'assignments' : 'saved items'} yet
                </h3>
                <p className="text-xs text-muted mt-1 max-w-xs">
                  {tab === 'saved'
                    ? 'Use the 3-dot menu on any AI response to save it here.'
                    : tab === 'flashcard_deck'
                    ? 'Use the Flashcards quick prompt in chat to generate a set.'
                    : tab === 'assignment'
                    ? 'Use the Assignment quick prompt in chat to generate one.'
                    : `Use the ${tab === 'quiz' ? 'Quiz' : tab === 'note' ? 'Study Note' : 'Infographic'} quick prompt in chat to generate one.`}
                </p>
              </div>
            )}
          {materials.filter((m) => m.type === tab).map((m) => (
              <div key={m.id} className="group relative bg-white/5 border border-default rounded-xl px-4 py-3 hover:border-strong transition">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-indigo-500/20 to-sky-500/20 border border-default">
                    {iconForType(m.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    {renamingId === m.id ? (
                      <input
                        autoFocus
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') confirmRename(m.id); if (e.key === 'Escape') setRenamingId(null); }}
                        className="w-full bg-white/10 border border-strong rounded px-2 py-0.5 text-sm text-primary focus:outline-none"
                      />
                    ) : (
                      <p className="text-sm font-medium text-primary truncate">{m.title}</p>
                    )}
                    <p className="text-xs text-muted mt-0.5">
                      {new Date(m.created_at).toLocaleDateString()} · {subtitleForType(m)}
                    </p>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpen(menuOpen === m.id ? null : m.id)}
                      className="p-1.5 rounded-lg text-muted hover:text-white hover-surface-strong transition"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {menuOpen === m.id && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(null)} />
                        <div className="absolute right-0 top-8 z-30 bg-elevated border border-default rounded-xl shadow-2xl py-1 w-40">
                          <MenuItem icon={Eye} label="View" onClick={() => { setViewing({ kind: m.type as ViewItem['kind'], material: m }); setMenuOpen(null); }} />
                          {m.type === 'flashcard_deck' && (
                            <MenuItem icon={FileDown} label="Download PDF" onClick={() => { downloadDeckPdf(m); setMenuOpen(null); }} />
                          )}
                          {m.type === 'infographic' && (
                            <MenuItem icon={ImageDown} label="Download PNG" onClick={() => { setViewing({ kind: 'infographic', material: m }); setMenuOpen(null); }} />
                          )}
                          <MenuItem icon={Download} label="Download" onClick={() => { downloadMaterial(m); setMenuOpen(null); }} />
                          <MenuItem icon={Pencil} label="Rename" onClick={() => startRename(m)} />
                          {m.type === 'flashcard_deck' && (
                            <MenuItem icon={Pencil} label="Edit" onClick={() => startEdit(m)} />
                          )}
                          <MenuItem icon={Trash2} label="Delete" danger onClick={() => { onDeleteMaterial(m.id); setMenuOpen(null); }} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slugify(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60);
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * Infographic HTML is written by the AI, and the AI's context contains pasted
 * links and transcripts, so it is untrusted. Strip anything executable before
 * it is written into a document that shares this app's origin.
 */
export function sanitizeInfographicHtml(html: string): string {
  return html
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*script\b[^>]*\/?>/gi, '')
    .replace(/<\s*(iframe|object|embed|form|base|link)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(iframe|object|embed|form|base|link)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src|action|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')
    .replace(/(href|src|action|xlink:href)\s*=\s*javascript:[^\s>]*/gi, '$1="#"');
}

function printHtmlAsPdf(html: string, title: string) {
  const iframe = document.createElement('iframe');
  // No allow-scripts: nothing inside the printed document may execute.
  iframe.setAttribute('sandbox', 'allow-same-origin allow-modals');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow!.onload = () => {
    setTimeout(() => {
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 250);
  };
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition ${
        danger ? 'text-rose-400 hover:bg-rose-500/10' : 'text-secondary hover-surface-strong hover:text-white'
      }`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

const InfographicViewer = forwardRef<HTMLIFrameElement, { html: string }>(function InfographicViewer(
  { html },
  ref,
) {
  const internalRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [contentWidth, setContentWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const iframe = internalRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  useEffect(() => {
    const measure = () => {
      const iframe = internalRef.current;
      const container = containerRef.current;
      if (!iframe || !container) return;
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) return;
      const cw = doc.body.scrollWidth || doc.documentElement.scrollWidth;
      const ch = doc.body.scrollHeight || doc.documentElement.scrollHeight;
      iframe.style.width = `${cw}px`;
      iframe.style.height = `${ch}px`;
      setContentWidth(cw);
      const available = container.clientWidth - 32;
      setScale(cw > available ? available / cw : 1);
    };
    const id = setTimeout(measure, 300);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(id); window.removeEventListener('resize', measure); };
  }, [html]);

  useEffect(() => {
    const iframe = internalRef.current;
    if (ref) {
      if (typeof ref === 'function') ref(iframe);
      else (ref as React.MutableRefObject<HTMLIFrameElement | null>).current = iframe;
    }
  }, [ref]);

  return (
    <div className="p-4 overflow-auto flex justify-center" ref={containerRef}>
      <div
        style={{
          width: contentWidth || '100%',
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
        }}
      >
        <iframe
          ref={internalRef}
          title="Infographic preview"
          className="bg-white border border-default rounded-xl"
          style={{ border: 'none', display: 'block', width: '100%' }}
          sandbox="allow-same-origin allow-popups"
        />
      </div>
    </div>
  );
});
