// Versionamento do namespace de armazenamento local.
//
// Não é possível apagar remotamente o localStorage dos navegadores. A estratégia
// é versionar: ao subir um deploy após o reset de dados, incrementa-se
// APP_STORAGE_VERSION; no primeiro carregamento cada navegador descarta o
// conteúdo antigo (sessão Supabase, progresso público, cache persistido) e volta
// para a tela de login.
//
// Sequência oficial do reset: reset do banco/Auth/Storage -> incrementar a
// versão abaixo -> deploy. Não incrementar sem reset: usuários seriam
// desconectados sem necessidade.
export const APP_STORAGE_VERSION = 1;

const VERSION_KEY = 'sv-erp:storage-version';

const LEGACY_PREFIXES = [
  'sb-', // sessões Supabase
  'admission-signature-progress:', // progresso público de assinatura
  'sv-erp:', // caches internos da aplicação
  'REACT_QUERY_OFFLINE_CACHE', // cache persistido, se habilitado
];

export function ensureStorageNamespace(storage: Storage = localStorage): boolean {
  let current: string | null = null;
  try {
    current = storage.getItem(VERSION_KEY);
  } catch {
    return false;
  }

  if (current === String(APP_STORAGE_VERSION)) return false;

  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key || key === VERSION_KEY) continue;
    if (LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix))) doomed.push(key);
  }
  doomed.forEach((key) => storage.removeItem(key));
  storage.setItem(VERSION_KEY, String(APP_STORAGE_VERSION));
  return doomed.length > 0;
}
