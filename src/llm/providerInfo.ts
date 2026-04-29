import { Provider } from './provider';

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: 'Anthropic Claude',
  gemini: 'Google Gemini (free)',
};

export const PROVIDER_KEY_HINT: Record<Provider, string> = {
  anthropic: 'sk-ant-…',
  gemini: 'AIza… (Google AI Studio)',
};

export const PROVIDER_KEY_URL: Record<Provider, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
};

export const PROVIDER_BLURB: Record<Provider, string> = {
  anthropic:
    'Pay-as-you-go Anthropic API. Highest answer quality; small per-request charge.',
  gemini:
    'Google AI Studio free tier. Rate-limited (10 req/min on Flash) but $0 to use.',
};
