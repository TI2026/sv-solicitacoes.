import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type QuickActionTone = 'primary' | 'warning' | 'danger';

interface QuickActionButtonProps {
  label: string;
  icon: LucideIcon;
  tone?: QuickActionTone;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
  /** Oculta o label em telas pequenas e mostra apenas o ícone (padrão: true). */
  hideLabelOnMobile?: boolean;
}

const TONE_CLASSES: Record<QuickActionTone, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  warning: 'bg-amber-500 text-white hover:bg-amber-600',
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse',
};

/**
 * Botão padrão para "ação rápida" em cards/linhas de listagem (RC Final — Onda 2).
 * Cores consistentes por tom (primary / warning / danger).
 */
export function QuickActionButton({
  label,
  icon: Icon,
  tone = 'primary',
  onClick,
  className,
  hideLabelOnMobile = true,
}: QuickActionButtonProps) {
  return (
    <Button
      size="sm"
      className={cn('shrink-0 gap-1.5', TONE_CLASSES[tone], className)}
      onClick={onClick}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className={hideLabelOnMobile ? 'hidden sm:inline' : undefined}>{label}</span>
    </Button>
  );
}

export default QuickActionButton;