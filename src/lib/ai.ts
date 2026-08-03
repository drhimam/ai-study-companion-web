import { PROVIDERS, resolveBaseUrl, resolveModel } from './providers';
import { supabase } from './supabase';
import type { Attachment, Message, Settings } from '@/types';

/**
 * The proxy requires a real session: the anon key is public and proves nothing.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export type StreamHandlers = {
  onToken: (token: string) => void;
  signal?: AbortSignal;
};

type Turn = { role: 'system' | 'user' | 'assistant'; content: string };

const SYSTEM_PROMPT =
  'You are AI Web Companion, a friendly, expert academic study tutor for students. ' +
  'Explain concepts clearly with step-by-step reasoning. Use Markdown for formatting: ' +
  'headings, bullet lists, numbered steps, bold for key terms, and tables where useful. ' +
  'For math, write clean Unicode equations (e.g. σ² = 1.20); you may use simple LaTeX inline ' +
  'like \\( x^2 \\) sparingly. Be concise but complete.';

const API_PROXY_URL = import.meta.env.VITE_BETTER_AUTH_URL 
  ? `${import.meta.env.VITE_BETTER_AUTH_URL}/api/ai-proxy` 
  : '/api/ai-proxy';

export async function streamChat(
  _settings: Settings,
  history: Message[],
  attachments: Attachment[],
  handlers: StreamHandlers,
): Promise<void> {
  const turns = buildTurns(history, attachments);

  const res = await fetch(API_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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
    // Detail belongs in the console, not on screen.
    console.error('Empty AI response payload:', json);
    throw new Error('The AI returned an empty reply. Please try again, or pick a different model in Settings.');
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
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ action: 'fetch-url', url }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `Failed to fetch URL (${res.status}).`;
    try {
      const j = JSON.parse(text);
      if (j.error) message = j.error;
    } catch {
      // keep default
    }
    throw new Error(message);
  }

  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return { title: json.title || url, content: json.content || '' };
}

export async function fetchYoutubeTranscript(url: string): Promise<{ title: string; content: string }> {
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ action: 'fetch-youtube', url }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `Failed to fetch YouTube transcript (${res.status}).`;
    try {
      const j = JSON.parse(text);
      if (j.error) message = j.error;
    } catch {
      // keep default
    }
    throw new Error(message);
  }

  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return { title: json.title || url, content: json.content || '' };
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
    label: 'Draft Reply',
    icon: '📧',
    template: (i) => `Draft a polite, professional reply to the following message.\n\n${i}`,
  },
  {
    label: 'Flashcards',
    icon: '🃏',
    kind: 'flashcards',
    template: (i) => {
      const len = i.trim().length;
      let count = 5;
      if (len > 3000) count = 20;
      else if (len > 2000) count = 15;
      else if (len > 1200) count = 12;
      else if (len > 600) count = 8;
      return (
        `Create ${count} study flashcards from the following content. ` +
        `Cover as many distinct concepts as possible — each card should teach one self-contained idea. ` +
        `Format each card EXACTLY as:\n` +
        `[FLASHCARD_START]\nFront: <concept>\nBack: <definition>\nAnalogy: <analogy>\nFormula: <formula or N/A>\n[FLASHCARD_END]\n\n` +
        `Content:\n${i}`
      );
    },
  },
  {
    label: 'Study Note',
    icon: '🗒️',
    kind: 'note',
    template: (i) =>
      `Create a compact study note from the following content. Use headings, bullet points, a comparison table if relevant, and key takeaways.\n\n${i}`,
  },
  {
    label: 'Quiz',
    icon: '🎯',
    kind: 'quiz',
    template: (i) =>
      `Create a 5-question multiple-choice quiz from the following content. Format EACH question EXACTLY as:\n` +
      `[QUIZ_QUESTION_START]\n` +
      `Type: mcq\n` +
      `Question: <question text>\n` +
      `Options: A) ... | B) ... | C) ... | D) ...\n` +
      `Correct: <letter, e.g. A>\n` +
      `Explanation: <brief explanation>\n` +
      `[QUIZ_QUESTION_END]\n\n` +
      `Content:\n${i}`,
  },
  {
    label: 'Infographic',
    icon: '📊',
    kind: 'infographic',
    template: (i) => buildInfographicPrompt(i, {
      pageSize: 'A4',
      orientation: 'Landscape',
      colorPalette: 'Multicolor',
      infographicType: 'Concept Maps',
    }),
  },
  {
    label: 'Assignment',
    icon: '📄',
    kind: 'assignment',
    template: (i) => buildAssignmentPrompt(i),
  },
];

export function buildQuizPrompt(input: string, config: {
  count: number;
  difficulty: string;
  types: { mcq: number; multi: number; short: number };
}): string {
  const { count, difficulty, types } = config;
  const parts: string[] = [];
  if (types.mcq > 0) parts.push(`${types.mcq}% single best answer MCQ (4 options A-D, one correct)`);
  if (types.multi > 0) parts.push(`${types.multi}% multi-select MCQ (4 options A-D, one or more correct)`);
  if (types.short > 0) parts.push(`${types.short}% short answer question (no options, model answer provided)`);

  return (
    `Create a ${count}-question quiz at ${difficulty} difficulty from the following content.\n` +
    `Question type distribution: ${parts.join(', ')}.\n\n` +
    `Format EACH question EXACTLY as:\n` +
    `[QUIZ_QUESTION_START]\n` +
    `Type: <mcq|multi|short>\n` +
    `Question: <question text>\n` +
    `Options: <A) ... | B) ... | C) ... | D) ...>  (omit for short answer)\n` +
    `Correct: <letter(s) for mcq/multi, e.g. "A" or "A,C" | model answer for short>\n` +
    `Explanation: <brief explanation>\n` +
    `[QUIZ_QUESTION_END]\n\n` +
    `Content:\n${input}`
  );
}

export type InfographicConfig = {
  pageSize: 'A4' | 'Legal' | 'A3' | 'Letter';
  orientation: 'Landscape' | 'Portrait';
  colorPalette: 'Multicolor' | 'Greyscale' | 'Black & White';
  infographicType: 'Timelines' | 'Processes/Flowcharts' | 'Concept Maps' | 'Hierarchies' | 'Cheat Sheets' | 'Comparisons' | 'Data Charts' | 'Informational';
  instructions?: string;
};

export function buildInfographicPrompt(input: string, config: InfographicConfig): string {
  const { pageSize, orientation, colorPalette, infographicType, instructions } = config;

  const paletteDesc: Record<InfographicConfig['colorPalette'], string> = {
    'Multicolor': 'Use a rich, vibrant multi-color palette with 4-6 complementary colors for visual distinction between sections.',
    'Greyscale': 'Use a greyscale palette only — shades of gray from #1a1a1a to #e5e5e5 with no color hues.',
    'Black & White': 'Use strictly black (#000) and white (#fff) only, with bold borders and patterns for visual separation.',
  };

  const typeDesc: Record<InfographicConfig['infographicType'], string> = {
    'Timelines': 'Organize as a visual timeline with chronological flow, date/time markers, and milestone nodes connected by a central line.',
    'Processes/Flowcharts': 'Organize as a flowchart with connected process boxes, decision diamonds, arrows showing flow direction, and clear start/end points.',
    'Concept Maps': 'Organize as a concept map with a central node, branching sub-concepts, connecting lines with relationship labels, and grouped clusters.',
    'Hierarchies': 'Organize as a hierarchy tree with a root node at top, branching levels below, and clear parent-child relationships.',
    'Cheat Sheets': 'Organize as a dense reference cheat sheet with multiple compact panels, quick-reference tables, key formulas, and mnemonics.',
    'Comparisons': 'Organize as a side-by-side comparison with two or more columns, shared criteria rows, and visual contrast between options.',
    'Data Charts': 'Organize around data visualizations — bar charts, pie charts, line graphs rendered in CSS/HTML, with data labels and legends.',
    'Informational': 'Organize as a text-rich summary infographic with descriptive section headers, explanatory paragraphs, and emoji/CSS icons. Condense long articles, reports, or concepts into scannable, visually structured sections with clear headings and key takeaways.',
  };

  const sizeDims: Record<InfographicConfig['pageSize'], string> = {
    'A4': '210mm × 297mm',
    'Legal': '216mm × 356mm',
    'A3': '297mm × 420mm',
    'Letter': '216mm × 279mm',
  };

  const orientDesc = orientation === 'Landscape'
    ? `Set the page dimensions to landscape orientation (${sizeDims[pageSize].split(' × ')[1]} wide × ${sizeDims[pageSize].split(' × ')[0]} tall).`
    : `Set the page dimensions to portrait orientation (${sizeDims[pageSize]}).`;

  return (
    `Create a study infographic as a single self-contained HTML document. Use inline CSS only — no external resources, no images, no JavaScript.\n\n` +
    `DESIGN REQUIREMENTS:\n` +
    `- Page: ${pageSize} ${orientation}. ${orientDesc}\n` +
    `- @page rule: @page { size: ${pageSize} ${orientation}; margin: 10mm; }\n` +
    `- Color palette: ${paletteDesc[colorPalette]}\n` +
    `- Infographic type: ${typeDesc[infographicType]}\n` +
    `- Typography: Scale font sizes automatically. Headers ~24pt, Subheaders ~16pt, Body ~10-12pt. Maintain clear visual hierarchy.\n` +
    `- Print optimization: Content must fit cleanly within the page margins without spilling over. Use compact spacing.\n` +
    `- Visual balance: Highly compact yet clean, readable, and well-visualized. Use CSS for any charts/diagrams.\n` +
    `- Include a title header at the top and a small footer.\n\n` +
    `OUTPUT: Output ONLY the HTML document starting with <!DOCTYPE html>. No explanation, no markdown code fences.\n\n` +
    (instructions ? `Additional instructions from the user:\n${instructions}\n\n` : '') +
    `Content to visualize:\n${input}`
  );
}

export function buildAssignmentPrompt(input: string): string {
  return (
    `You are acting as a student completing an academic assignment. Your job is to actually DO the assignment — ` +
    `write the full, completed assignment — not create a blank template or assignment sheet.\n\n` +
    `Use the following as your sources:\n` +
    `- The instructions provided below (from the chat box or an uploaded instruction file).\n` +
    `- The current conversation context and any attached study materials as embedded background content.\n` +
    `- If the assignment requires current facts, real-world data, academic standards, or case studies beyond what's ` +
    `provided, use your knowledge to supplement. Clearly cite any external references inline.\n\n` +
    `Requirements for the completed assignment:\n` +
    `1. **Title** — A clear, academic title for the completed work.\n` +
    `2. **Introduction** — A brief introduction that frames the topic and scope.\n` +
    `3. **Body / Responses** — Fully written responses to every task, question, or prompt in the instructions. ` +
    `Write complete paragraphs, analyses, calculations, or code as required. Do not leave placeholders or say "student should…".\n` +
    `4. **Conclusion** — A concluding summary if appropriate to the assignment type.\n` +
    `5. **References** — List any sources referenced, including attached materials and any external knowledge used.\n\n` +
    `Write at the academic level appropriate to the instructions (e.g., high school, undergraduate, graduate). ` +
    `Format the output as clean Markdown with proper headings, tables, lists, and any other formatting the assignment requires.\n\n` +
    `Instructions:\n${input}`
  );
}
