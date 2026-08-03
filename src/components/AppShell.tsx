import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  MessageSquare,
  Layers,
  Settings as SettingsIcon,
  LogOut,
  Trash2,
  Pencil,
  Send,
  Square,
  Paperclip,
  Sparkles,
  X,
  Menu,
  Copy,
  Check,
  Download,
  RefreshCw,
  FileText,
  Link as LinkIcon,
  Bookmark,
  Share2,
  Youtube,
  Loader2,
  User as UserIcon,
  CreditCard,
  Crown,
  ChevronUp,
  MoreVertical,
  Pin,
  Search,
  ArrowDownUp,
  AlertTriangle,
  Upload,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { loadSettings, saveSettings } from '@/lib/settings';
import {
  loadLocalMessages, saveLocalMessages, deleteLocalMessage,
  clearLocalMessages, exportAllLocalMessages, importLocalMessages,
  type ExportBundle,
} from '@/lib/localMessages';
import { PROVIDERS, resolveModel } from '@/lib/providers';
import { streamChat, fetchUrlContent, fetchYoutubeTranscript, QUICK_PROMPTS, buildQuizPrompt, buildInfographicPrompt, buildAssignmentPrompt } from '@/lib/ai';
import type { Attachment, Flashcard, Message, Notebook, Settings, StudyMaterial, QuizContent, QuizQuestion, SimpleFlashcard, FlashcardDeckContent, SavedContent } from '@/types';
import { Markdown, renderMarkdown } from '@/components/Markdown';
import { SettingsModal } from '@/components/SettingsModal';
import { AccountGroup } from '@/components/AccountGroup';
import { StudyPage } from '@/components/StudyPage';
import { QuizConfigModal, type QuizConfig } from '@/components/QuizConfigModal';
import { InfographicConfigModal, type InfographicConfig } from '@/components/InfographicConfigModal';

const FLASHCARD_RE = /\[FLASHCARD_START\]\s*Front:\s*(.*?)\nBack:\s*(.*?)\nAnalogy:\s*(.*?)\nFormula:\s*(.*?)\s*\[FLASHCARD_END\]/gs;
const QUIZ_RE = /\[QUIZ_QUESTION_START\]\s*Type:\s*(\w+)\s*\nQuestion:\s*(.*?)\n(?:Options:\s*(.*?)\n)?Correct:\s*(.*?)\nExplanation:\s*(.*?)\s*\[QUIZ_QUESTION_END\]/gs;

const QUIZ_RE_FALLBACK = /(?:^|\n)\s*(?:Q\d+[.):]\s*|\d+[.)]\s*)(.*?)\n((?:[A-D][)\.]\s+.*?\n){2,4})Answer:\s*([A-D](?:\s*,\s*[A-D])*)\s*[-–]\s*(.*)/g;

function parseFlashcards(text: string): SimpleFlashcard[] {
  const out: SimpleFlashcard[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(FLASHCARD_RE.source, 'gs');
  while ((m = re.exec(text)) !== null) {
    out.push({
      front: m[1].trim(),
      back: m[2].trim(),
      analogy: m[3].trim() || null,
      formula: m[4].trim() && m[4].trim() !== 'N/A' ? m[4].trim() : null,
    });
  }
  return out;
}

function parseQuiz(text: string): QuizContent | null {
  const questions: QuizQuestion[] = [];
  let m: RegExpExecArray | null;

  // Primary format: structured [QUIZ_QUESTION_START] blocks
  const re = new RegExp(QUIZ_RE.source, 'gs');
  while ((m = re.exec(text)) !== null) {
    const type = m[1].trim().toLowerCase() as QuizQuestion['type'];
    const question = m[2].trim();
    const optionsStr = m[3] ? m[3].trim() : '';
    const correctStr = m[4].trim();
    const explanation = m[5].trim();

    let options: string[] = [];
    if (type !== 'short' && optionsStr) {
      options = optionsStr.split(/\|/).map((o) => o.replace(/^[A-D]\)\s*/, '').trim()).filter(Boolean);
    }

    let correct: number[] | string;
    if (type === 'short') {
      correct = correctStr;
    } else {
      correct = correctStr.split(',').map((c) => {
        const letter = c.trim().toUpperCase();
        return letter.charCodeAt(0) - 65;
      }).filter((n) => n >= 0 && n < 4);
    }

    questions.push({ id: crypto.randomUUID(), type, question, options, correct, explanation });
  }

  // Fallback: plain-text Q1/A)B)C)D)/Answer: A - explanation format
  if (questions.length === 0) {
    const re2 = new RegExp(QUIZ_RE_FALLBACK.source, 'gs');
    while ((m = re2.exec(text)) !== null) {
      const question = m[1].trim();
      const optionsBlock = m[2];
      const correctStr = m[3].trim();
      const explanation = m[4].trim();

      const options = optionsBlock
        .split('\n')
        .map((l) => l.replace(/^[A-D][)\.]\s*/, '').trim())
        .filter(Boolean);
      if (options.length < 2) continue;

      const correct = correctStr.split(',').map((c) => {
        const letter = c.trim().toUpperCase();
        return letter.charCodeAt(0) - 65;
      }).filter((n) => n >= 0 && n < options.length);

      questions.push({ id: crypto.randomUUID(), type: correct.length > 1 ? 'multi' : 'mcq', question, options, correct, explanation });
    }
  }

  if (questions.length === 0) return null;
  return { questions, difficulty: 'Medium', config: { count: questions.length, types: { mcq: 0, multi: 0, short: 0 } } };
}

function parseInfographic(text: string): { html: string } | null {
  const match = text.match(/<!DOCTYPE html>[\s\S]*<\/html>/i);
  if (match) return { html: match[0] };
  if (text.trim().startsWith('<') && text.trim().endsWith('>')) return { html: text.trim() };
  return null;
}

function isLikelyHtml(text: string): boolean {
  return /<!DOCTYPE html>|<html[\s\S]*<\/html>/i.test(text);
}

function stripPreamble(text: string): string {
  return text
    .replace(/^\s*(?:Here(?:'s| is| are)[^.]*\.\s*\n?|Sure[!,][^.]*\.\s*\n?|Certainly[!,][^.]*\.\s*\n?|Of course[!,][^.]*\.\s*\n?|Below[^.]*\.\s*\n?)/i, '')
    .replace(/^\s*(?:I[''']ve\s+(?:created|prepared|generated|put together)[^.]*\.\s*\n?)/i, '')
    .trim();
}

function slugify(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60);
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function titleFromContent(content: string): string {
  const firstLine = content.split('\n').map((l) => l.trim()).find((l) => l.length > 0) || '';
  const cleaned = firstLine
    .replace(/^#+\s*/, '')
    .replace(/^\s*(?:I[''']ve\s+(?:created|prepared|generated|put together)[^.]*\.\s*)/i, '')
    .replace(/[*_`#>\-\[\]()!]/g, '')
    .trim();
  return slugify(cleaned) || 'response';
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'study'>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * Database errors name tables, columns, constraints and policies. Keep that
   * detail in the console and show the user a plain message instead.
   */
  const reportError = (cause: unknown, friendly: string) => {
    console.error(friendly, cause);
    setError(friendly);
  };
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<'modified' | 'created' | 'alpha'>('modified');
  const [renameValue, setRenameValue] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [quizConfigOpen, setQuizConfigOpen] = useState(false);
  const [infographicConfigOpen, setInfographicConfigOpen] = useState(false);
  const [pendingKind, setPendingKind] = useState<string | null>(null);
  const [processingKind, setProcessingKind] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const AUTO_SAVE_KINDS = ['flashcards', 'note', 'quiz', 'infographic', 'assignment'];

  const KIND_LABELS: Record<string, string> = {
    flashcards: 'Flashcards',
    note: 'Study Note',
    quiz: 'Quiz',
    infographic: 'Infographic',
    assignment: 'Assignment',
  };

  const KIND_TAB: Record<string, string> = {
    flashcards: 'Flashcards',
    note: 'Study Notes',
    quiz: 'Quizzes',
    infographic: 'Infographics',
    assignment: 'Assignments',
  };

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const active = useMemo(() => notebooks.find((n) => n.id === activeId) ?? null, [notebooks, activeId]);

  const sortedNotebooks = useMemo(() => {
    let list = [...notebooks];
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter((n) => n.title.toLowerCase().includes(q));
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sortMode === 'alpha') return a.title.localeCompare(b.title);
      if (sortMode === 'created') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    return list;
  }, [notebooks, searchQuery, sortMode]);

  useEffect(() => {
    document.documentElement.classList.toggle('light', settings.theme === 'light');
  }, [settings.theme]);

  const loadNotebooks = useCallback(async () => {
    if (!user) return;
    const { data, error: err } = await supabase.from('notebooks').select('*').order('updated_at', { ascending: false });
    if (err) { reportError(err, 'Could not load your notebooks. Please refresh and try again.'); return; }
    setNotebooks((data as Notebook[]) || []);
    if (data && data.length > 0 && !activeId) setActiveId(data[0].id);
  }, [user, activeId]);

  useEffect(() => { loadNotebooks(); }, [loadNotebooks]);

  useEffect(() => {
    if (!activeId) { setMessages([]); setFlashcards([]); setMaterials([]); return; }
    (async () => {
      const msgs = loadLocalMessages(activeId);
      setMessages(msgs);
      const [{ data: cards, error: fe }, { data: mats, error: mate }] = await Promise.all([
        supabase.from('flashcards').select('*').eq('notebook_id', activeId).order('created_at', { ascending: true }),
        supabase.from('study_materials').select('*').eq('notebook_id', activeId).order('created_at', { ascending: false }),
      ]);
      if (fe) reportError(fe, 'Could not load the flashcards in this notebook.');
      if (mate) reportError(mate, 'Could not load the study materials in this notebook.');
      setFlashcards((cards as Flashcard[]) || []);
      setMaterials((mats as StudyMaterial[]) || []);
    })();
  }, [activeId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamText, view]);

  useEffect(() => {
    if (menuOpenId === null) return;
    const handler = () => setMenuOpenId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpenId]);

  const createNotebook = async () => {
    const title = `New Notebook ${notebooks.length + 1}`;
    const { data, error: err } = await supabase.from('notebooks').insert({ title }).select().single();
    if (err) { reportError(err, 'Could not create the notebook. Please try again.'); return; }
    const nb = data as Notebook;
    setNotebooks((n) => [nb, ...n]);
    setActiveId(nb.id);
    setView('chat');
  };

  const renameNotebook = async (id: string, title: string) => {
    const { error: err } = await supabase.from('notebooks').update({ title }).eq('id', id);
    if (err) { reportError(err, 'Could not rename the notebook. Please try again.'); return; }
    setNotebooks((n) => n.map((nb) => (nb.id === id ? { ...nb, title } : nb)));
    setRenamingId(null);
  };

  const deleteNotebook = async (id: string) => {
    const { error: err } = await supabase.from('notebooks').delete().eq('id', id);
    if (err) { reportError(err, 'Could not delete the notebook. Please try again.'); return; }
    clearLocalMessages(id);
    setNotebooks((n) => n.filter((nb) => nb.id !== id));
    if (activeId === id) {
      const remaining = notebooks.filter((nb) => nb.id !== id);
      setActiveId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const togglePin = async (id: string) => {
    const nb = notebooks.find((n) => n.id === id);
    if (!nb) return;
    const pinned = !nb.pinned;
    const { error: err } = await supabase.from('notebooks').update({ pinned }).eq('id', id);
    if (err) { reportError(err, 'Could not pin the notebook. Please try again.'); return; }
    setNotebooks((n) => n.map((x) => (x.id === id ? { ...x, pinned } : x)));
  };

  const exportNotebook = (nb: Notebook) => {
    const lines: string[] = [`# ${nb.title}`, ''];
    for (const msg of messages) {
      const role = msg.role === 'user' ? '**You:**' : '**Assistant:**';
      lines.push(role);
      lines.push('');
      lines.push(msg.content || '');
      lines.push('');
      if (msg.attachments) {
        for (const att of msg.attachments) {
          lines.push(`> 📎 ${att.name}`);
          lines.push('');
        }
      }
      lines.push('---');
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nb.title.replace(/[^a-z0-9]+/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearChat = () => {
    if (!activeId) return;
    if (!confirm('Clear all messages in this notebook? This removes them from your browser storage.')) return;
    clearLocalMessages(activeId);
    setMessages([]);
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isMedia = /\.(mp3|wav|m4a|ogg|mp4|webm|mpeg)$/i.test(file.name);
    const text = isMedia ? `[Audio/video file: ${file.name} — transcription not supported in web app]` : await file.text();
    setAttachments((a) => [...a, { type: 'file', name: file.name, content: text.slice(0, 100000) }]);
  };

  const addLink = async () => {
    const url = prompt('Paste a URL to read:');
    if (!url) return;
    setError(null);
    try {
      const { title, content } = await fetchUrlContent(url);
      setAttachments((a) => [...a, { type: 'link', name: title, content }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch that URL.');
    }
  };

  const addYouTube = async () => {
    const url = prompt('Paste a YouTube URL to extract its transcript:');
    if (!url) return;
    setError(null);
    try {
      const { title, content } = await fetchYoutubeTranscript(url);
      setAttachments((a) => [...a, { type: 'link', name: `YouTube: ${title}`, content }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch YouTube transcript.');
    }
  };

  const addPageText = () => {
    const text = prompt('Paste text or page content to attach:');
    if (!text) return;
    setAttachments((a) => [...a, { type: 'text', name: `Text ${a.length + 1}`, content: text.slice(0, 100000) }]);
  };

  const send = async (overrideInput?: string, kind?: string | null) => {
    const content = (overrideInput ?? input).trim();
    if (!content || streaming) return;

    setError(null);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const userMsg: Message = {
      id: crypto.randomUUID(),
      notebook_id: activeId || '',
      user_id: user?.id || '',
      role: 'user',
      content,
      attachments: attachments.length > 0 ? attachments : null,
      created_at: new Date().toISOString(),
    };

    const history = [...messages, userMsg];
    setMessages(history);
    const currentAttachments = attachments;
    setStreaming(true);
    setStreamText('');

    const controller = new AbortController();
    abortRef.current = controller;
    const currentKind = kind || pendingKind;
    const isAutoSave = currentKind != null && AUTO_SAVE_KINDS.includes(currentKind);
    setPendingKind(null);
    if (isAutoSave) setProcessingKind(currentKind);

    let acc = '';
    try {
      await streamChat(settings, history, currentAttachments, {
        signal: controller.signal,
        onToken: (t) => { acc += t; if (!isAutoSave) setStreamText(acc); },
      });

      if (!acc.trim()) acc = '(No response received.)';

      // Strip AI preamble for cleaner output
      acc = stripPreamble(acc);

      if (activeId) {
        const savedUserMsg: Message = {
          ...userMsg,
          id: crypto.randomUUID(),
          notebook_id: activeId,
          created_at: new Date().toISOString(),
        };

        let savedMaterial = false;
        let savedKind: string | null = null;

        // parse flashcards and save as a deck
        const parsed = parseFlashcards(acc);
        if (parsed.length > 0) {
          const deckContent: FlashcardDeckContent = { cards: parsed };
          const title = `Flashcard Deck ${new Date().toLocaleDateString()}`;
          const { data: newDeck } = await supabase
            .from('study_materials').insert({ notebook_id: activeId, type: 'flashcard_deck', title, content: deckContent }).select('*').single();
          if (newDeck) { setMaterials((m) => [newDeck as StudyMaterial, ...m]); savedMaterial = true; savedKind = 'flashcard_deck'; }
        }

        // parse quiz
        const quizContent = parseQuiz(acc);
        if (quizContent) {
          const title = `Quiz ${new Date().toLocaleDateString()}`;
          const { data: newQuiz } = await supabase
            .from('study_materials').insert({ notebook_id: activeId, type: 'quiz', title, content: quizContent }).select('*').single();
          if (newQuiz) { setMaterials((m) => [newQuiz as StudyMaterial, ...m]); savedMaterial = true; savedKind = 'quiz'; }
        }

        // save infographic (HTML output from infographic prompt)
        if (!quizContent && currentKind === 'infographic' && isLikelyHtml(acc)) {
          const infoContent = parseInfographic(acc);
          if (infoContent) {
            const title = `Infographic ${new Date().toLocaleDateString()}`;
            const { data: newMat } = await supabase
              .from('study_materials').insert({ notebook_id: activeId, type: 'infographic', title, content: infoContent }).select('*').single();
            if (newMat) { setMaterials((m) => [newMat as StudyMaterial, ...m]); savedMaterial = true; }
          }
        }

        // save assignment (markdown output from assignment prompt)
        if (currentKind === 'assignment') {
          const assignContent = { text: acc };
          const title = `Completed Assignment ${new Date().toLocaleDateString()}`;
          const { data: newMat } = await supabase
            .from('study_materials').insert({ notebook_id: activeId, type: 'assignment', title, content: assignContent }).select('*').single();
          if (newMat) { setMaterials((m) => [newMat as StudyMaterial, ...m]); savedMaterial = true; }
        }

        // save study note (markdown output from note prompt)
        if (!quizContent && currentKind === 'note') {
          const noteContent = { html: renderMarkdown(acc) };
          const title = `Study Note ${new Date().toLocaleDateString()}`;
          const { data: newMat } = await supabase
            .from('study_materials').insert({ notebook_id: activeId, type: 'note', title, content: noteContent }).select('*').single();
          if (newMat) { setMaterials((m) => [newMat as StudyMaterial, ...m]); savedMaterial = true; }
        }

        // For auto-save quick prompts, show a short confirmation instead of the full output
        let assistantContent = acc;
        if (isAutoSave && savedMaterial && currentKind && savedKind === currentKind) {
          const label = KIND_LABELS[currentKind] || 'Material';
          const tab = KIND_TAB[currentKind] || 'Study';
          assistantContent = `✅ Your ${label} has been generated and saved. You can find it on the **Study** page under the **${tab}** tab.`;
        } else if (isAutoSave && currentKind && !savedMaterial) {
          const label = KIND_LABELS[currentKind] || 'material';
          assistantContent = `⚠️ Could not save the ${label.toLowerCase()} automatically. The AI response did not match the expected format. You can still copy the content below and save it manually.`;
        }

        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          notebook_id: activeId,
          user_id: user?.id || '',
          role: 'assistant',
          content: assistantContent,
          attachments: null,
          created_at: new Date().toISOString(),
        };

        const finalMessages = [...history.filter((m) => m.id !== userMsg.id), savedUserMsg, assistantMsg];
        saveLocalMessages(activeId, finalMessages);
        setMessages(finalMessages);
      } else {
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          notebook_id: activeId || '',
          user_id: user?.id || '',
          role: 'assistant',
          content: acc,
          attachments: null,
          created_at: new Date().toISOString(),
        };
        setMessages([...history, assistantMsg]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed.';
      if (msg !== 'The user aborted a request.') {
        setError(msg);
        setMessages([...history, {
          id: crypto.randomUUID(), notebook_id: activeId || '', user_id: user?.id || '',
          role: 'assistant', content: `⚠️ ${msg}`, attachments: null, created_at: new Date().toISOString(),
        }]);
      }
    } finally {
      setStreaming(false);
      setStreamText('');
      setProcessingKind(null);
      abortRef.current = null;
    }
  };

  const stop = () => { abortRef.current?.abort(); };

  const regenerate = async (assistantMsg: Message) => {
    const idx = messages.findIndex((m) => m.id === assistantMsg.id);
    if (idx < 1) return;
    const userMsg = messages[idx - 1];
    if (userMsg.role !== 'user') return;
    const updated = messages.filter((x) => x.id !== assistantMsg.id);
    if (activeId) { saveLocalMessages(activeId, updated); }
    setMessages(updated);
    await send(userMsg.content);
  };

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const updateCardStatus = async (id: string, status: Flashcard['status']) => {
    setFlashcards((c) => c.map((x) => (x.id === id ? { ...x, status } : x)));
    await supabase.from('flashcards').update({ status }).eq('id', id);
  };

  const deleteCard = async (id: string) => {
    setFlashcards((c) => c.filter((x) => x.id !== id));
    await supabase.from('flashcards').delete().eq('id', id);
  };

  const renameMaterial = async (id: string, title: string) => {
    setMaterials((m) => m.map((x) => (x.id === id ? { ...x, title } : x)));
    await supabase.from('study_materials').update({ title }).eq('id', id);
  };

  const deleteMaterial = async (id: string) => {
    setMaterials((m) => m.filter((x) => x.id !== id));
    await supabase.from('study_materials').delete().eq('id', id);
  };

  const editMaterial = async (id: string, title: string, content: string) => {
    const mat = materials.find((m) => m.id === id);
    if (!mat || mat.type !== 'flashcard_deck') return;

    let parsed: FlashcardDeckContent;
    try {
      parsed = JSON.parse(content) as FlashcardDeckContent;
    } catch {
      setError('Invalid JSON. Please check the format and try again.');
      return;
    }

    if (!parsed.cards || !Array.isArray(parsed.cards) || parsed.cards.length < 1 || parsed.cards.length > 200) {
      setError('A flashcard deck must contain between 1 and 200 cards.');
      return;
    }

    for (const card of parsed.cards) {
      if (!card.front || !card.back || typeof card.front !== 'string' || typeof card.back !== 'string') {
        setError('Each card needs a front and back text field.');
        return;
      }
      if (card.front.length > 2000 || card.back.length > 2000) {
        setError('Card text cannot exceed 2000 characters.');
        return;
      }
    }

    const { error: rpcError } = await supabase.rpc('update_flashcard_deck', {
      p_material_id: id,
      p_title: title || mat.title,
      p_content: parsed as unknown as Record<string, unknown>,
    });

    if (rpcError) {
      console.error('Flashcard edit failed', rpcError);
      setError('Could not save the flashcard deck. Please check your edits and try again.');
      return;
    }

    setMaterials((m) => m.map((x) => (x.id === id ? { ...x, title: title || x.title, content: parsed as StudyMaterial['content'] } : x)));
  };

  const saveResponse = async (msg: Message) => {
    if (!activeId) return;
    const savedContent: SavedContent = { text: msg.content };
    const title = `Saved ${new Date().toLocaleDateString()}`;
    const { data: newMat } = await supabase
      .from('study_materials').insert({ notebook_id: activeId, type: 'saved', title, content: savedContent }).select('*').single();
    if (newMat) {
      setMaterials((m) => [newMat as StudyMaterial, ...m]);
      setError('Saved to Study deck.');
      setTimeout(() => setError(null), 2000);
    }
  };

  const shareText = async (text: string) => {
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* user cancelled */ }
    } else {
      navigator.clipboard.writeText(text);
      setError('Copied to clipboard (sharing not supported).');
      setTimeout(() => setError(null), 2000);
    }
  };

  const onSaveSettings = (s: Settings) => { setSettings(s); saveSettings(s); };

  const onExportAll = () => {
    const bundle = exportAllLocalMessages();
    const total = bundle.notebooks.reduce((sum, n) => sum + n.messages.length, 0);
    if (total === 0) { setError('No messages to export. Your chat history is empty.'); setTimeout(() => setError(null), 3000); return; }
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-companion-backup_${timestamp()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as ExportBundle;
      const mode = confirm(
        'Click OK to MERGE imported messages with your current ones (duplicates skipped).\n\n' +
        'Click Cancel to REPLACE all current messages with the imported ones (this deletes your current chat history).'
      ) ? 'merge' : 'replace';
      const result = importLocalMessages(bundle, mode);
      if (activeId) { setMessages(loadLocalMessages(activeId)); }
      setError(`Import complete: ${result.imported} messages across ${result.notebooks} notebooks (${mode === 'merge' ? 'merged' : 'replaced'}).`);
      setTimeout(() => setError(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the backup file.');
      setTimeout(() => setError(null), 4000);
    }
    setImportModalOpen(false);
  };

  const onQuickPrompt = (p: typeof QUICK_PROMPTS[number]) => {
    setQuickOpen(false);
    const text = input.trim() || 'the current topic';
    if (p.kind === 'quiz') {
      setQuizConfigOpen(true);
      return;
    }
    if (p.kind === 'infographic') {
      setInfographicConfigOpen(true);
      return;
    }
    if (p.kind) setPendingKind(p.kind);
    send(p.template(text), p.kind);
  };

  const onQuizConfigConfirm = (config: QuizConfig) => {
    setQuizConfigOpen(false);
    const text = input.trim() || 'the current topic';
    const prompt = buildQuizPrompt(text, config);
    setPendingKind('quiz');
    send(prompt, 'quiz');
  };

  const onInfographicConfigConfirm = (config: InfographicConfig) => {
    setInfographicConfigOpen(false);
    const text = input.trim() || 'the current topic';
    const prompt = buildInfographicPrompt(text, config);
    setPendingKind('infographic');
    send(prompt, 'infographic');
  };

  const providerLabel = PROVIDERS[settings.provider].label;
  const modelLabel = resolveModel(settings);

  return (
    <div className="h-screen flex bg-app text-primary overflow-hidden">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 flex-shrink-0 border-r border-default bg-panel overflow-hidden flex flex-col`}>
        <div className="p-3 border-b border-default">
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm">AI Companion</span>
          </div>
          <button onClick={createNotebook} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-400/30 text-indigo-200 text-sm font-medium transition">
            <Plus className="w-4 h-4" /> New Notebook
          </button>
          <div className="relative mt-2.5">
            <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notebooks…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-default text-xs text-primary placeholder:text-muted focus:outline-none focus:border-indigo-400/40 transition"
            />
          </div>
          <div className="flex items-center gap-1 mt-2 px-1">
            <ArrowDownUp className="w-3 h-3 text-muted flex-shrink-0" />
            {(['modified', 'created', 'alpha'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition ${sortMode === mode ? 'bg-white/10 text-primary' : 'text-muted hover:text-secondary'}`}
              >
                {mode === 'modified' ? 'Modified' : mode === 'created' ? 'Created' : 'A–Z'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {notebooks.length === 0 && <p className="text-xs text-muted text-center py-6 px-2">No notebooks yet. Create one to start chatting.</p>}
          {sortedNotebooks.length === 0 && searchQuery && <p className="text-xs text-muted text-center py-6 px-2">No notebooks match "{searchQuery}".</p>}
          {sortedNotebooks.map((nb) => (
            <div
              key={nb.id}
              onClick={() => { setActiveId(nb.id); setView('chat'); setMenuOpenId(null); }}
              className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition ${activeId === nb.id ? 'bg-white/10 text-primary' : 'text-muted hover-surface hover:text-primary'}`}
            >
              {nb.pinned && <Pin className="w-3 h-3 text-amber-400 flex-shrink-0 fill-amber-400/20" />}
              {!nb.pinned && <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />}
              {renamingId === nb.id ? (
                <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter') renameNotebook(nb.id, renameValue.trim() || nb.title); if (e.key === 'Escape') setRenamingId(null); }} className="flex-1 bg-white/10 border border-strong rounded px-1.5 py-0.5 text-xs text-primary focus:outline-none" />
              ) : <span className={`flex-1 truncate ${nb.pinned ? 'font-medium' : ''}`}>{nb.title}</span>}
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === nb.id ? null : nb.id); }}
                className={`p-1 rounded hover-surface-strong text-muted hover:text-white transition ${menuOpenId === nb.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              {menuOpenId === nb.id && (
                <div className="absolute right-0 top-full mt-1 z-30 w-44 bg-account-menu border border-default rounded-xl shadow-2xl shadow-black/40 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePin(nb.id); setMenuOpenId(null); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-secondary hover-surface hover:text-primary transition text-left"
                  >
                    <Pin className={`w-4 h-4 ${nb.pinned ? 'text-amber-400' : 'text-muted'}`} />
                    {nb.pinned ? 'Unpin' : 'Pin to top'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); exportNotebook(nb); setMenuOpenId(null); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-secondary hover-surface hover:text-primary transition text-left"
                  >
                    <Download className="w-4 h-4 text-muted" />
                    Export as Markdown
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setRenamingId(nb.id); setRenameValue(nb.title); setMenuOpenId(null); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-secondary hover-surface hover:text-primary transition text-left"
                  >
                    <Pencil className="w-4 h-4 text-muted" />
                    Rename
                  </button>
                  <div className="border-t border-default">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteNotebook(nb.id); setMenuOpenId(null); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition text-left"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="p-2 border-t border-default">
          <AccountGroup
            email={user?.email ?? ''}
            onSettings={() => setSettingsOpen(true)}
            onSignOut={signOut}
          />
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-default bg-panel">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setSidebarOpen((s) => !s)} className="p-1.5 rounded-lg hover-surface-strong text-muted hover:text-white transition"><Menu className="w-4 h-4" /></button>
            <span className="text-sm font-medium truncate">{active ? active.title : 'No notebook selected'}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="flex bg-white/5 rounded-lg p-0.5 mr-2">
              <button onClick={() => setView('chat')} className={`px-3 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${view === 'chat' ? 'bg-white/10 text-primary' : 'text-muted hover:text-white'}`}><MessageSquare className="w-3.5 h-3.5" /> Chat</button>
              <button onClick={() => setView('study')} className={`px-3 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${view === 'study' ? 'bg-white/10 text-primary' : 'text-muted hover:text-white'}`}><Layers className="w-3.5 h-3.5" /> Study</button>
            </div>
            <button onClick={clearChat} disabled={!activeId} className="p-1.5 rounded-lg hover-surface-strong text-muted hover:text-rose-400 disabled:opacity-40 transition" title="Clear chat"><Trash2 className="w-4 h-4" /></button>
            <button onClick={() => setSettingsOpen(true)} className="p-1.5 rounded-lg hover-surface-strong text-muted hover:text-white transition" title="Settings"><SettingsIcon className="w-4 h-4" /></button>
          </div>
        </header>

        {error && (
          <div className="mx-4 mt-3 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-300"><X className="w-4 h-4" /></button>
          </div>
        )}

        {view === 'study' ? (
          <StudyPage
            materials={materials}
            onRenameMaterial={renameMaterial}
            onDeleteMaterial={deleteMaterial}
            onEditMaterial={editMaterial}
          />
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              {messages.length === 0 && !streaming && (
                <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-sky-500/20 border border-default flex items-center justify-center mb-4"><Sparkles className="w-7 h-7 text-indigo-300" /></div>
                  <h2 className="text-lg font-semibold text-primary">Ask anything</h2>
                  <p className="text-sm text-muted mt-1 max-w-md">Type a question, paste study material, attach files, or use a quick prompt. Your AI tutor will explain step by step.</p>
                  {!settings.apiKey && settings.provider !== 'custom' && (
                    <div className="mt-4 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">Add your {providerLabel} API key in Settings to start chatting.</div>
                  )}
                </div>
              )}
              <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    copied={copiedId === m.id}
                    onCopy={() => copyText(m.id, m.content)}
                    onDownload={() => downloadText(`${titleFromContent(m.content)}_${timestamp()}.txt`, m.content)}
                    onRegenerate={() => regenerate(m)}
                    onSave={() => saveResponse(m)}
                    onShare={() => shareText(m.content)}
                  />
                ))}
                {streaming && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center flex-shrink-0"><Sparkles className="w-4 h-4 text-white" /></div>
                    <div className="flex-1 min-w-0 rounded-2xl bg-white/5 border border-default px-4 py-3">
                      {processingKind ? (
                        <div className="flex items-center gap-2.5">
                          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin flex-shrink-0" />
                          <span className="text-sm text-secondary">
                            Generating {KIND_LABELS[processingKind] || 'content'}… This will be saved to your Study page automatically.
                          </span>
                        </div>
                      ) : streamText ? <Markdown content={streamText} /> : (
                        <div className="flex gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-default bg-panel px-4 py-3">
              <div className="max-w-3xl mx-auto">
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {attachments.map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-500/15 border border-indigo-400/30 text-xs text-indigo-200">
                        {a.type === 'link' ? <LinkIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                        {a.name.length > 24 ? a.name.slice(0, 24) + '…' : a.name}
                        <button onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))} className="text-indigo-300 hover:text-white"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
                {quickOpen && (
                  <div className="mb-2 bg-elevated border border-default rounded-xl shadow-xl p-1.5 grid grid-cols-2 gap-1">
                    {QUICK_PROMPTS.map((p) => (
                      <button key={p.label} onClick={() => onQuickPrompt(p)} className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-secondary hover-surface-strong hover:text-white transition text-left">
                        <span>{p.icon}</span> {p.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2 bg-white/5 border border-default rounded-2xl px-3 py-2 focus-within:border-indigo-400/40 transition">
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-lg hover-surface-strong text-muted hover:text-white transition" title="Attach file"><Paperclip className="w-4 h-4" /></button>
                    <button onClick={addLink} className="p-1.5 rounded-lg hover-surface-strong text-muted hover:text-white transition" title="Add link"><LinkIcon className="w-4 h-4" /></button>
                    <button onClick={addYouTube} className="p-1.5 rounded-lg hover-surface-strong text-muted hover:text-white transition" title="Add YouTube transcript"><Youtube className="w-4 h-4" /></button>
                    <button onClick={addPageText} className="p-1.5 rounded-lg hover-surface-strong text-muted hover:text-white transition" title="Paste text"><FileText className="w-4 h-4" /></button>
                    <button onClick={() => setQuickOpen((o) => !o)} className={`p-1.5 rounded-lg transition ${quickOpen ? 'bg-indigo-500/20 text-indigo-300' : 'hover-surface-strong text-muted hover:text-white'}`} title="Quick prompts"><Sparkles className="w-4 h-4" /></button>
                  </div>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      const el = e.target;
                      el.style.height = 'auto';
                      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder={`Ask ${providerLabel} (${modelLabel})…`}
                    rows={3}
                    disabled={streaming}
                    className="flex-1 bg-transparent resize-none text-sm text-primary placeholder:text-muted focus:outline-none max-h-40 py-1.5 disabled:opacity-60 leading-relaxed"
                    style={{ minHeight: '72px' }}
                  />
                  {streaming ? (
                    <button onClick={stop} className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition" title="Stop"><Square className="w-4 h-4 fill-current" /></button>
                  ) : (
                    <button onClick={() => send()} disabled={!input.trim()} className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 hover:from-indigo-400 hover:to-sky-400 disabled:opacity-40 text-white transition shadow-lg shadow-indigo-500/20" title="Send"><Send className="w-4 h-4" /></button>
                  )}
                </div>
                <p className="text-[10px] text-dim text-center mt-1.5">Enter to send · Shift+Enter for newline · Quick prompts auto-save to Study page</p>
              </div>
            </div>
          </>
        )}
      </main>

      <input ref={fileInputRef} type="file" className="hidden" onChange={onPickFile} />
      <SettingsModal open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} onSave={onSaveSettings} onExport={onExportAll} onImport={() => setImportModalOpen(true)} />
      <input ref={importFileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportFile} />
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setImportModalOpen(false)}>
          <div className="bg-surface border border-default rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-primary">Import Chat History</h3>
                <p className="text-xs text-muted mt-1">Select a backup JSON file to restore messages.</p>
              </div>
            </div>
            <div className="rounded-lg bg-amber-500/10 border border-amber-400/20 p-3 mb-4">
              <p className="text-xs text-amber-200/80 leading-relaxed">
                You will be asked to choose between <strong>Merge</strong> (add only new messages, skip duplicates) or <strong>Replace</strong> (overwrite all current messages). Replacing is irreversible.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => importFileRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500/15 border border-indigo-400/30 text-indigo-200 text-sm font-medium hover:bg-indigo-500/25 transition">
                <Upload className="w-3.5 h-3.5" /> Choose File
              </button>
              <button onClick={() => setImportModalOpen(false)} className="px-4 py-2 rounded-lg bg-white/5 border border-default text-secondary text-sm font-medium hover:text-white transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <QuizConfigModal open={quizConfigOpen} onClose={() => setQuizConfigOpen(false)} onConfirm={onQuizConfigConfirm} />
      <InfographicConfigModal open={infographicConfigOpen} onClose={() => setInfographicConfigOpen(false)} onConfirm={onInfographicConfigConfirm} />
    </div>
  );
}

function MessageBubble({ message, copied, onCopy, onRegenerate, onDownload, onSave, onShare }: {
  message: Message; copied: boolean; onCopy: () => void; onRegenerate: () => void; onDownload: () => void; onSave: () => void; onShare: () => void;
}) {
  const isUser = message.role === 'user';
  if (message.role === 'system') return null;
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-slate-700' : 'bg-gradient-to-br from-indigo-500 to-sky-500'}`}>
        {isUser ? <span className="text-xs font-semibold text-white">U</span> : <Sparkles className="w-4 h-4 text-white" />}
      </div>
      <div className={`group flex-1 min-w-0 ${isUser ? 'flex flex-col items-end' : ''}`}>
        <div className={`rounded-2xl px-4 py-3 max-w-full ${isUser ? 'bg-indigo-500/15 border border-indigo-400/30 text-primary' : 'bg-white/5 border border-default text-primary'}`}>
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {message.attachments.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 text-xs text-secondary">
                  {a.type === 'link' ? <LinkIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                  {a.name.length > 20 ? a.name.slice(0, 20) + '…' : a.name}
                </span>
              ))}
            </div>
          )}
          {isUser ? <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p> : <Markdown content={message.content} />}
        </div>
        {!isUser && (
          <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition">
            <button onClick={onCopy} className="p-1 rounded text-muted hover:text-white hover-surface-strong transition" title="Copy">{copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}</button>
            <button onClick={onDownload} className="p-1 rounded text-muted hover:text-white hover-surface-strong transition" title="Download"><Download className="w-3.5 h-3.5" /></button>
            <button onClick={onShare} className="p-1 rounded text-muted hover:text-white hover-surface-strong transition" title="Share"><Share2 className="w-3.5 h-3.5" /></button>
            <button onClick={onSave} className="p-1 rounded text-muted hover:text-white hover-surface-strong transition" title="Save to Study Deck"><Bookmark className="w-3.5 h-3.5" /></button>
            <button onClick={onRegenerate} className="p-1 rounded text-muted hover:text-white hover-surface-strong transition" title="Regenerate"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
    </div>
  );
}
