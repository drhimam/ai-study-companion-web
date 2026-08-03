import type { ProviderConfig, ProviderId, Settings } from '@/types';

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    baseUrl: 'https://api.deepseek.com/v1',
    apiStyle: 'openai',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
    defaultModel: 'gpt-4o-mini',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com/v1',
    apiStyle: 'openai',
  },
  claude: {
    id: 'claude',
    label: 'Anthropic Claude',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    defaultModel: 'claude-3-5-sonnet-20241022',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    baseUrl: 'https://api.anthropic.com/v1',
    apiStyle: 'anthropic',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    defaultModel: 'gemini-2.0-flash',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiStyle: 'gemini',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    defaultModel: 'llama-3.3-70b-versatile',
    apiKeyUrl: 'https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiStyle: 'openai',
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    models: ['mistral-small-latest', 'mistral-large-latest', 'open-mistral-7b'],
    defaultModel: 'mistral-small-latest',
    apiKeyUrl: 'https://console.mistral.ai/api-keys/',
    baseUrl: 'https://api.mistral.ai/v1',
    apiStyle: 'openai',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001', 'meta-llama/llama-3.3-70b-instruct'],
    defaultModel: 'openai/gpt-4o-mini',
    apiKeyUrl: 'https://openrouter.ai/keys',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiStyle: 'openai',
  },
  custom: {
    id: 'custom',
    label: 'Custom / Ollama',
    models: ['llama3.2', 'qwen2.5', 'deepseek-r1:14b'],
    defaultModel: 'llama3.2',
    apiKeyUrl: '',
    baseUrl: 'http://localhost:11434/v1',
    apiStyle: 'openai',
  },
};

export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  model: PROVIDERS.openai.defaultModel,
  customModel: '',
  apiKey: '',
  customBaseUrl: '',
  theme: 'dark',
};

export function resolveModel(settings: Settings): string {
  return settings.customModel.trim() || settings.model || PROVIDERS[settings.provider].defaultModel;
}

export function resolveBaseUrl(settings: Settings): string {
  if (settings.provider === 'custom' && settings.customBaseUrl.trim()) {
    return settings.customBaseUrl.trim().replace(/\/$/, '');
  }
  return PROVIDERS[settings.provider].baseUrl;
}
