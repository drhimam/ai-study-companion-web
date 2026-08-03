export type Notebook = {
  id: string;
  user_id: string;
  title: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type MessageRole = 'user' | 'assistant' | 'system';

export type Attachment = {
  type: 'text' | 'page' | 'link' | 'file';
  name: string;
  content: string;
};

export type Message = {
  id: string;
  notebook_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  attachments: Attachment[] | null;
  created_at: string;
};

export type FlashcardStatus = 'new' | 'hard' | 'got_it';

export type Flashcard = {
  id: string;
  notebook_id: string;
  user_id: string;
  front: string;
  back: string;
  analogy: string | null;
  formula: string | null;
  status: FlashcardStatus;
  created_at: string;
};

export type MaterialType = 'quiz' | 'note' | 'infographic' | 'flashcard_deck' | 'saved' | 'assignment';

export type SimpleFlashcard = {
  front: string;
  back: string;
  analogy: string | null;
  formula: string | null;
};

export type FlashcardDeckContent = {
  cards: SimpleFlashcard[];
};

export type SavedContent = {
  text: string;
};

export type AssignmentContent = {
  text: string;
};

export type QuizQuestionType = 'mcq' | 'multi' | 'short';

export type QuizQuestion = {
  id: string;
  type: QuizQuestionType;
  question: string;
  options: string[];
  correct: number[] | string;
  explanation: string;
};

export type QuizContent = {
  questions: QuizQuestion[];
  difficulty: string;
  config: { count: number; types: { mcq: number; multi: number; short: number } };
};

export type NoteContent = { html: string };

export type InfographicContent = { html: string };

export type StudyMaterial = {
  id: string;
  notebook_id: string;
  user_id: string;
  type: MaterialType;
  title: string;
  content: QuizContent | NoteContent | InfographicContent | FlashcardDeckContent | SavedContent | AssignmentContent;
  created_at: string;
  updated_at: string;
};

export type ProviderId =
  | 'deepseek'
  | 'openai'
  | 'claude'
  | 'gemini'
  | 'groq'
  | 'mistral'
  | 'openrouter'
  | 'custom';

export type ProviderConfig = {
  id: ProviderId;
  label: string;
  models: string[];
  defaultModel: string;
  apiKeyUrl: string;
  baseUrl: string;
  apiStyle: 'openai' | 'anthropic' | 'gemini';
};

export type Settings = {
  provider: ProviderId;
  model: string;
  customModel: string;
  apiKey: string;
  customBaseUrl: string;
  theme: 'dark' | 'light';
};
