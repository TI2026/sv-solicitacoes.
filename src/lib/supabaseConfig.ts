export interface PublicSupabaseEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

export interface SupabaseConfigResult {
  url: string;
  publishableKey: string;
  error: string | null;
}

const TEST_URL = 'http://127.0.0.1:54321';
const TEST_KEY = 'test-publishable-key';

export function resolveSupabaseConfig(env: PublicSupabaseEnv, mode: string): SupabaseConfigResult {
  const configuredUrl = env.VITE_SUPABASE_URL?.trim() ?? '';
  const configuredKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

  if (mode === 'test' && (!configuredUrl || !configuredKey)) {
    return { url: TEST_URL, publishableKey: TEST_KEY, error: null };
  }

  const missing = [
    !configuredUrl ? 'VITE_SUPABASE_URL' : null,
    !configuredKey ? 'VITE_SUPABASE_PUBLISHABLE_KEY' : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    return {
      url: TEST_URL,
      publishableKey: TEST_KEY,
      error: `Configuração ausente: defina ${missing.join(' e ')} no ambiente do frontend.`,
    };
  }

  try {
    const parsed = new URL(configuredUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
  } catch {
    return {
      url: TEST_URL,
      publishableKey: TEST_KEY,
      error: 'Configuração inválida: VITE_SUPABASE_URL deve ser uma URL HTTP(S) válida.',
    };
  }

  return { url: configuredUrl, publishableKey: configuredKey, error: null };
}
