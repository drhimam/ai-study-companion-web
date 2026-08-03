import type { Attachment, FlashcardDeckContent, InfographicContent, Message, QuizContent, Settings, SimpleFlashcard } from '@/types';

export type StreamHandlers = {
  onToken: (token: string) => void;
  signal?: AbortSignal;
};

type Turn = { role: 'system' | 'user' | 'assistant'; content: string };

const WORKER_BASE_URL = import.meta.env.VITE_BETTER_AUTH_URL || 'https://ai-study-companion-backend.rifa-numis.workers.dev';
const API_PROXY_URL = `${WORKER_BASE_URL.replace(/\/$/, '')}/api/ai-proxy`;

function buildTurns(history: Message[], attachments: Attachment[]): Turn[] {
  const turns: Turn[] = [];
  const recentHistory = history.slice(-10);

  for (const msg of recentHistory) {
    if (!msg.content.trim()) continue;
    turns.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    });
  }

  if (attachments && attachments.length > 0) {
    const attachmentText = attachments
      .map((a) => `[Attachment: ${a.name}]\n${a.content || ''}`)
      .join('\n\n');
    if (turns.length > 0 && turns[turns.length - 1].role === 'user') {
      turns[turns.length - 1].content += `\n\n${attachmentText}`;
    } else {
      turns.push({ role: 'user', content: attachmentText });
    }
  }

  return turns;
}

export async function streamChat(
  _settings: Settings,
  history: Message[],
  attachments: Attachment[],
  handlers: StreamHandlers,
): Promise<void> {
  const turns = buildTurns(history, attachments);
  const token = localStorage.getItem('better-auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(API_PROXY_URL, {
    method: 'POST',
    headers,
    signal: handlers.signal,
    body: JSON.stringify({
      turns,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `Request failed (${res.status}).`;
    try {
      const j = JSON.parse(text);
      if (j.error) message = j.error;
    } catch {
      if (text) message = text.slice(0, 300);
    }
    throw new Error(message);
  }

  const json = await res.json();
  if (json.error) throw new Error(json.error);

  const content: string = json.content || '';
  if (!content.trim()) {
    console.error('Empty AI response payload:', json);
    throw new Error('The AI returned an empty reply. Please try again.');
  }

  // Simulate streaming by chunking the response for a smooth UX
  const chunkSize = 4;
  for (let i = 0; i < content.length; i += chunkSize) {
    if (handlers.signal?.aborted) break;
    handlers.onToken(content.slice(i, i + chunkSize));
    await new Promise((r) => setTimeout(r, 8));
  }
}

export async function fetchUrlContent(url: string): Promise<{ title: string; content: string }> {
  return { title: url, content: `Content extracted from ${url}` };
}

export async function fetchYoutubeTranscript(url: string): Promise<{ title: string; content: string }> {
  return { title: url, content: `Transcript extracted from YouTube video at ${url}` };
}

export function buildQuizPrompt(topic: string, count = 5): string {
  return `Generate a multiple choice practice quiz with ${count} questions on the topic: "${topic}".\n` +
    `Output ONLY a valid JSON object matching this structure:\n` +
    `{\n  "title": "${topic} Quiz",\n  "questions": [\n    {\n      "id": "q1",\n      "question": "...",\n      "options": ["A", "B", "C", "D"],\n      "correctIndex": 0,\n      "explanation": "..."\n    }\n  ]\n}\nNo markdown codeblocks or outer text.`;
}

export function buildInfographicPrompt(topic: string): string {
  return `Create a visually rich, styled HTML document for an infographic summary on the topic: "${topic}". Use clean CSS styling with modern layout cards, clean typography, vibrant visual hierarchy, and bullet lists. Return raw HTML only.`;
}

export function buildAssignmentPrompt(topic: string): string {
  return `Create a comprehensive academic study assignment on the topic: "${topic}". Include 3 parts: Part A (Key Terms & Concepts), Part B (Short Answer Practice Questions), and Part C (Sample Model Solutions).`;
}

export function buildNotePrompt(topic: string): string {
  return `Create a complete, beautifully structured study guide note on the topic: "${topic}". Include an Introduction, Core Principles, Key Formulas or Rules, Practical Examples, and Common Pitfalls. Use Markdown.`;
}

export function parseFlashcards(text: string): SimpleFlashcard[] {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x: any) => x && typeof x.front === 'string' && typeof x.back === 'string');
  } catch {
    return [];
  }
}

export function parseQuiz(text: string): QuizContent | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      return parsed as QuizContent;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseInfographic(text: string): InfographicContent | null {
  if (isLikelyHtml(text)) {
    return { html: text };
  }
  return null;
}

export function isLikelyHtml(text: string): boolean {
  return text.includes('<html') || text.includes('<div') || text.includes('<style') || text.includes('<!DOCTYPE html');
}

export const QUICK_PROMPTS: { label: string; icon: string; kind?: 'flashcards' | 'note' | 'quiz' | 'infographic'; template: (input: string) => string }[] = [
  {
    label: 'Solve',
    icon: '❓',
    template: (i) =>
      `Solve the following question or problem step by step. Show your reasoning clearly and give the final answer.\n\n${i}`,
  },
  {
    label: 'Explain',
    icon: '🎓',
    template: (i) =>
      `Explain the following concept in detail for a student. Use simple language, an analogy, and a concrete example.\n\n${i}`,
  },
  {
    label: 'Summarize',
    icon: '📝',
    template: (i) => `Summarize the following content into clear bullet points and key takeaways.\n\n${i}`,
  },
  {
    label: 'Make Concise',
    icon: '⚡',
    template: (i) => `Rewrite the following to be concise while keeping the core meaning.\n\n${i}`,
  },
  {
    label: 'Fix Grammar',
    icon: '✍️',
    template: (i) => `Correct the grammar and structure of the following. Output only the corrected version.\n\n${i}`,
  },
  {
    label: 'Academic Refine',
    icon: '🎓',
    template: (i) => `Rewrite the following in a formal, academic, professional tone.\n\n${i}`,
  },
  {
    label: 'Generate Flashcards',
    icon: '📇',
    kind: 'flashcards',
    template: (i) =>
      `Create a deck of study flashcards based on the text below.\n` +
      `Output ONLY a single JSON array with 5 to 15 objects. No surrounding markdown fences, no extra text.\n` +
      `Each object MUST have exact keys: "front", "back", and optionally "analogy" and "formula".\n\nText:\n${i}`,
  },
  {
    label: 'Create Quiz',
    icon: '🧪',
    kind: 'quiz',
    template: (i) =>
      `Generate a multiple choice practice quiz based on the content below.\n` +
      `Output ONLY a valid JSON object matching this structure:\n` +
      `{\n  "title": "Quiz Title",\n  "questions": [\n    {\n      "id": "q1",\n      "question": "...",\n      "options": ["A", "B", "C", "D"],\n      "correctIndex": 0,\n      "explanation": "..."\n    }\n  ]\n}\nNo markdown codeblocks or outer text.\n\nContent:\n${i}`,
  },
  {
    label: 'Generate Note',
    icon: '📑',
    kind: 'note',
    template: (i) =>
      `Create a comprehensive, well-structured study note summarizing the following material. Use headings, key terms in bold, bullet lists, and clear explanations.\n\nContent:\n${i}`,
  },
];
