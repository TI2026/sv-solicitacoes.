export function getSecureExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // Permitir apenas https (e http para localhost/127.0.0.1)
    if (parsed.protocol !== 'https:') {
      if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
        // Permitido para testes locais
      } else {
        return null;
      }
    }

    // Rejeitar credenciais embutidas
    if (parsed.username || parsed.password) {
      return null;
    }

    return parsed.toString();
  } catch (e) {
    // URL malformada
    return null;
  }
}

export function openSecureWindow(url: string) {
  const secureUrl = getSecureExternalUrl(url);
  if (secureUrl) {
    window.open(secureUrl, '_blank', 'noopener,noreferrer');
  } else {
    console.error('Tentativa de abrir URL insegura bloqueada:', url);
  }
}

/**
 * Abre um Blob gerado localmente (mesma origem) em nova aba.
 *
 * `openSecureWindow` só aceita http(s) — blobs locais são bloqueados por ela.
 * Este helper é o caminho correto para conteúdo produzido pela própria app
 * (relatórios, PDFs), sem afrouxar a validação de URLs externas.
 * O objeto é revogado após a abertura para não vazar memória.
 */
export function openLocalBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    console.error('Pop-up bloqueado ao abrir relatório.');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return !!win;
}
