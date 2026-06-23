import { getStatusVariant } from '@/lib/constants';
import { getStatusVisual } from '@/lib/statusVisuals';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
  /** Quando true (default), exibe o ícone Lucide do status. */
  withIcon?: boolean;
  /**
   * Quando true (default), usa a paleta semântica unificada (statusVisuals).
   * Defina false para preservar o estilo `status-*` legado em telas que
   * dependem dos tokens antigos.
   */
  semantic?: boolean;
}

export function StatusBadge({
  status,
  label,
  className,
  withIcon = true,
  semantic = true,
}: StatusBadgeProps) {
  if (semantic) {
    const visual = getStatusVisual(status);
    const Icon = visual.Icon;
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
          visual.badgeClass,
          className,
        )}
      >
        {withIcon && <Icon className="w-3 h-3" />}
        {label ?? visual.label}
      </span>
    );
  }

  const variant = getStatusVariant(status);
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        variant === 'approved' && 'status-approved',
        variant === 'rejected' && 'status-rejected',
        variant === 'info' && 'status-info',
        variant === 'pending' && 'status-pending',
        className,
      )}
    >
      {label ?? status}
    </span>
  );
}
