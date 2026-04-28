/**
 * Wrapper around expo-secure-store for LLM provider credentials.
 *
 * Two providers are supported: Anthropic (paid) and Google Gemini (free tier).
 * Each provider stores its own API key and preferred model under a separate
 * key. The `provider` setting tracks which one the app is currently using.
 *
 * Keys are never written anywhere else — no SQLite, no logs.
 */
import { defaultModelFor, isProvider, Provider } from '../llm/provider';

const ANTHROPIC_KEY_NAME = 'anthropic_api_key';
const ANTHROPIC_MODEL_NAME = 'anthropic_model';
const GEMINI_KEY_NAME = 'gemini_api_key';
const GEMINI_MODEL_NAME = 'gemini_model';
const PROVIDER_NAME = 'llm_provider';

type SecureStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

let injected: SecureStore | null = null;

export function setSecureStoreForTests(store: SecureStore | null): void {
  injected = store;
}

async function store(): Promise<SecureStore> {
  if (injected) return injected;
  const mod = (await import('expo-secure-store')) as unknown as SecureStore;
  return mod;
}

function keyNameFor(provider: Provider): string {
  return provider === 'gemini' ? GEMINI_KEY_NAME : ANTHROPIC_KEY_NAME;
}

function modelNameFor(provider: Provider): string {
  return provider === 'gemini' ? GEMINI_MODEL_NAME : ANTHROPIC_MODEL_NAME;
}

export async function getProvider(): Promise<Provider> {
  const s = await store();
  const v = await s.getItemAsync(PROVIDER_NAME);
  return isProvider(v) ? v : 'anthropic';
}

export async function setProvider(provider: Provider): Promise<void> {
  const s = await store();
  await s.setItemAsync(PROVIDER_NAME, provider);
}

export async function getApiKeyFor(provider: Provider): Promise<string | null> {
  const s = await store();
  return s.getItemAsync(keyNameFor(provider));
}

export async function setApiKeyFor(provider: Provider, key: string): Promise<void> {
  const s = await store();
  await s.setItemAsync(keyNameFor(provider), key);
}

export async function clearApiKeyFor(provider: Provider): Promise<void> {
  const s = await store();
  await s.deleteItemAsync(keyNameFor(provider));
}

export async function getModelFor(provider: Provider): Promise<string> {
  const s = await store();
  return (await s.getItemAsync(modelNameFor(provider))) ?? defaultModelFor(provider);
}

export async function setModelFor(provider: Provider, model: string): Promise<void> {
  const s = await store();
  await s.setItemAsync(modelNameFor(provider), model);
}

/** Active-provider convenience accessors. Used by ingest/query/merge call sites. */
export async function getApiKey(): Promise<string | null> {
  return getApiKeyFor(await getProvider());
}

export async function setApiKey(key: string): Promise<void> {
  await setApiKeyFor(await getProvider(), key);
}

export async function clearApiKey(): Promise<void> {
  await clearApiKeyFor(await getProvider());
}

export async function getModel(): Promise<string> {
  return getModelFor(await getProvider());
}

export async function setModel(model: string): Promise<void> {
  await setModelFor(await getProvider(), model);
}

export function maskKey(key: string | null): string {
  if (!key) return '(not set)';
  if (key.length < 8) return '****';
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}
