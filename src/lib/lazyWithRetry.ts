import { lazy, type ComponentType } from 'react';

type Importer<T> = () => Promise<{ default: ComponentType<T> }>;

const RELOAD_KEY = 'sv:chunk-reload-at';
const RELOAD_COOLDOWN_MS = 15_000;

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk|Failed to fetch/i.test(
    message,
  );
}

/**
 * Recarrega a página uma única vez quando um chunk antigo não existe mais
 * (situação típica após um novo deploy, que resulta em tela branca).
 * Retorna true quando o reload foi disparado.
 */
function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage indisponível — segue com o reload mesmo assim
  }
  window.location.reload();
  return true;
}

/**
 * React.lazy resiliente: tenta novamente uma vez e, se o chunk realmente
 * não existir mais (deploy novo), força um reload em vez de quebrar a árvore.
 */
export function lazyWithRetry<T = Record<string, unknown>>(importer: Importer<T>) {
  return lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      if (isChunkLoadError(error)) {
        try {
          return await importer();
        } catch (retryError) {
          if (reloadOnce()) {
            // Mantém o Suspense ativo enquanto a página recarrega
            return await new Promise<{ default: ComponentType<T> }>(() => {});
          }
          throw retryError;
        }
      }
      throw error;
    }
  });
}
