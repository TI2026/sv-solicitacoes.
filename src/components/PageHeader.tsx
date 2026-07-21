import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/**
 * Cabeçalho padrão de módulo (RC Final — Onda 2).
 * Uso: <PageHeader icon={Fuel} title="Solicitações" subtitle="Todas as solicitações" actions={<Button>...</Button>} />
 */
export function PageHeader({ icon: Icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
          {Icon ? <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" /> : null}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle ? (
          <p className="text-sm text-muted-foreground mt-0.5 sm:mt-1">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

export default PageHeader;