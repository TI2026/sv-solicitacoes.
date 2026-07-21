import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FiltersBarProps {
  children: ReactNode;
  className?: string;
}

/**
 * Container padrão para barra de filtros de listagem (RC Final — Onda 2).
 * Padroniza fundo, borda, padding e alinhamento em todos os módulos.
 */
export function FiltersBar({ children, className }: FiltersBarProps) {
  return (
    <div
      className={cn(
        'bg-card border rounded-lg p-3 sm:p-4 flex flex-wrap items-end gap-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

export default FiltersBar;