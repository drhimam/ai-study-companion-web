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

export function buildFlashcardsPrompt(topic: string): string {
  return (
    `Create a deck of study flashcards based on the following content.\n` +
    `Output ONLY a single JSON array with 5 to 15 objects. No surrounding markdown fences, no extra text.\n` +
    `Each object MUST have these exact keys:\n` +
    `  "front"   – the question or term (string)\n` +
    `  "back"    – the answer or definition (string)\n` +
    `  "analogy" – a helpful analogy or null\n` +
    `  "formula" – a formula/equation or null\n\n` +
    `Content:\n${topic}`
  );
}

export function buildQuizPrompt(topic: string, countOrConfig: number | any = 5): string {
  const count = typeof countOrConfig === 'number' ? countOrConfig : (countOrConfig?.count || countOrConfig?.questionCount || 5);
  const difficulty = typeof countOrConfig === 'object' && countOrConfig?.difficulty ? ` Difficulty: ${countOrConfig.difficulty}.` : '';
  const mcqPct  = typeof countOrConfig === 'object' ? (countOrConfig?.types?.mcq  ?? 60) : 60;
  const multiPct = typeof countOrConfig === 'object' ? (countOrConfig?.types?.multi ?? 20) : 20;
  const shortPct = typeof countOrConfig === 'object' ? (countOrConfig?.types?.short ?? 20) : 20;

  // Derive actual counts per type
  const mcqCount   = Math.round(count * mcqPct  / 100);
  const multiCount = Math.round(count * multiPct / 100);
  const shortCount = count - mcqCount - multiCount;

  return (
    `Generate a practice quiz with exactly ${count} questions on: "${topic}".${difficulty}\n` +
    `Breakdown: ~${mcqCount} single-choice MCQ, ~${multiCount} multi-select, ~${shortCount} short-answer.\n\n` +
    `Output ONLY a valid JSON object — no markdown fences, no outer text — matching this EXACT structure:\n` +
    `{\n` +
    `  "title": "Quiz Title",\n` +
    `  "difficulty": "${typeof countOrConfig === 'object' ? (countOrConfig?.difficulty || 'Medium') : 'Medium'}",\n` +
    `  "questions": [\n` +
    `    {\n` +
    `      "id": "q1",\n` +
    `      "type": "mcq",\n` +
    `      "question": "Question text here",\n` +
    `      "options": ["Option A", "Option B", "Option C", "Option D"],\n` +
    `      "correct": [0],\n` +
    `      "explanation": "Why this answer is correct"\n` +
    `    },\n` +
    `    {\n` +
    `      "id": "q2",\n` +
    `      "type": "multi",\n` +
    `      "question": "Which of the following are correct? (select all)",\n` +
    `      "options": ["Option A", "Option B", "Option C", "Option D"],\n` +
    `      "correct": [0, 2],\n` +
    `      "explanation": "Explanation"\n` +
    `    },\n` +
    `    {\n` +
    `      "id": "q3",\n` +
    `      "type": "short",\n` +
    `      "question": "Short answer question?",\n` +
    `      "options": [],\n` +
    `      "correct": "Model answer",\n` +
    `      "explanation": "Explanation"\n` +
    `    }\n` +
    `  ]\n` +
    `}`
  );
}

export function buildInfographicPrompt(topic: string, config?: any): string {
  let styleInfo = '';
  if (config) {
    const details: string[] = [];
    if (config.infographicType) details.push(`Type: ${config.infographicType}`);
    if (config.pageSize) details.push(`Size: ${config.pageSize}`);
    if (config.orientation) details.push(`Orientation: ${config.orientation}`);
    if (config.colorPalette) details.push(`Color Palette: ${config.colorPalette}`);
    if (config.instructions) details.push(`Custom Instructions: ${config.instructions}`);
    if (details.length > 0) styleInfo = ` Specifications: (${details.join(', ')}).`;
  }
  return (
    `Create a visually rich, self-contained HTML infographic on the topic: "${topic}".${styleInfo}\n` +
    `Requirements:\n` +
    `- Return raw HTML starting with <!DOCTYPE html> — no markdown fences, no outer prose\n` +
    `- Embed all CSS in a <style> block inside <head>\n` +
    `- Use modern card layout, vibrant colors, clean typography, and visual hierarchy\n` +
    `- Include relevant icons using Unicode or simple SVG shapes\n` +
    `- No JavaScript, no external resources`
  );
}

export function buildAssignmentPrompt(topic: string): string {
  return (
    `Create a comprehensive academic study assignment on the topic: "${topic}".\n` +
    `Include 3 sections:\n` +
    `  Part A – Key Terms & Concepts (define at least 6 terms)\n` +
    `  Part B – Short Answer Practice Questions (at least 5 questions)\n` +
    `  Part C – Sample Model Solutions (full answers for Part B)\n` +
    `Use Markdown formatting with clear headings.`
  );
}

export function buildNotePrompt(topic: string): string {
  return (
    `Create a complete, beautifully structured study guide on: "${topic}".\n` +
    `Sections to include:\n` +
    `  1. Introduction & Overview\n` +
    `  2. Core Principles & Key Concepts\n` +
    `  3. Key Formulas or Rules (if applicable)\n` +
    `  4. Worked Examples\n` +
    `  5. Common Pitfalls & Misconceptions\n` +
    `  6. Quick Summary Bullet Points\n` +
    `Use Markdown with clear headings, bold key terms, and bullet lists.`
  );
}

export function parseFlashcards(text: string): SimpleFlashcard[] {
  try {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
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
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) return null;

    // Normalise each question to match QuizContent schema
    const seenIds = new Set<string>();
    const questions: QuizContent['questions'] = parsed.questions.map((q: any) => {
      // Ensure unique id
      let id = typeof q.id === 'string' && q.id ? q.id : crypto.randomUUID();
      if (seenIds.has(id)) id = crypto.randomUUID();
      seenIds.add(id);

      // Ensure type is valid
      const type: 'mcq' | 'multi' | 'short' =
        q.type === 'multi' ? 'multi' : q.type === 'short' ? 'short' : 'mcq';

      // Coerce correct field
      let correct: number[] | string;
      if (type === 'short') {
        correct = typeof q.correct === 'string' ? q.correct : String(q.correct ?? '');
      } else if (Array.isArray(q.correct)) {
        correct = q.correct.map(Number).filter((n: number) => !isNaN(n));
      } else if (typeof q.correct === 'number') {
        // AI may emit correctIndex or correct as plain number
        correct = [q.correct];
      } else if (typeof q.correctIndex === 'number') {
        // Backwards-compat: old prompt used correctIndex
        correct = [q.correctIndex];
      } else {
        correct = [0];
      }

      const options: string[] = Array.isArray(q.options) ? q.options.map(String) : [];

      return {
        id,
        type,
        question: String(q.question || ''),
        options,
        correct,
        explanation: String(q.explanation || ''),
      };
    });

    const difficulty = typeof parsed.difficulty === 'string' ? parsed.difficulty : 'Medium';
    const count = questions.length;
    const mcq  = questions.filter((q) => q.type === 'mcq').length;
    const multi = questions.filter((q) => q.type === 'multi').length;
    const short = questions.filter((q) => q.type === 'short').length;

    return {
      questions,
      difficulty,
      config: { count, types: { mcq, multi, short } },
    };
  } catch {
    return null;
  }
}

export function parseInfographic(text: string): InfographicContent | null {
  const cleaned = text.replace(/^```html\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/g, '').trim();
  if (isLikelyHtml(cleaned)) {
    return { html: cleaned };
  }
  return null;
}

export function isLikelyHtml(text: string): boolean {
  return text.includes('<html') || text.includes('<div') || text.includes('<style') || text.includes('<!DOCTYPE html');
}

export const QUICK_PROMPTS: { label: string; icon: string; kind?: 'flashcards' | 'note' | 'quiz' | 'infographic' | 'assignment'; template: (input: string) => string }[] = [
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
    template: (i) => buildFlashcardsPrompt(i),
  },
  {
    label: 'Create Quiz',
    icon: '🧪',
    kind: 'quiz',
    template: (i) => buildQuizPrompt(i, 5),
  },
  {
    label: 'Generate Note',
    icon: '📑',
    kind: 'note',
    template: (i) => buildNotePrompt(i),
  },
  {
    label: 'Generate Infographic',
    icon: '📊',
    kind: 'infographic',
    template: (i) => buildInfographicPrompt(i),
  },
  {
    label: 'Generate Assignment',
    icon: '📋',
    kind: 'assignment',
    template: (i) => buildAssignmentPrompt(i),
  },
];
