/**
 * Wrapper around expo-secure-store for the Anthropic API key.
 * The key value is never written anywhere else (no SQLite, no logs).
 */
const KEY_NAME = 'anthropic_api_key';
const MODEL_NAME = 'anthropic_model';

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

export async function getApiKey(): Promise<string | null> {
  const s = await store();
  return s.getItemAsync(KEY_NAME);
}

export async function setApiKey(key: string): Promise<void> {
  const s = await store();
  await s.setItemAsync(KEY_NAME, key);
}

export async function clearApiKey(): Promise<void> {
  const s = await store();
  await s.deleteItemAsync(KEY_NAME);
}

export async function getModel(): Promise<string> {
  const s = await store();
  return (await s.getItemAsync(MODEL_NAME)) ?? 'claude-sonnet-4-20250514';
}

export async function setModel(model: string): Promise<void> {
  const s = await store();
  await s.setItemAsync(MODEL_NAME, model);
}

export function maskKey(key: string | null): string {
  if (!key) return '(not set)';
  if (key.length < 8) return '****';
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}
