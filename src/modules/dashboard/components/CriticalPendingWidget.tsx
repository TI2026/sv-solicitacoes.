/**
 * CriticalPendingWidget.tsx
 *
 * CAMADA: Component
 *
 * Responsabilidade: renderizar as pendências críticas e anomalias
 * operacionais detectadas pelo criticalPendingsLoader.
 *
 * Regras obrigatórias:
 *  - NUNCA acessar Supabase diretamente.
 *  - NUNCA gerenciar estado de dados.
 *
 * Padrão: Component (este) → useCriticalPendings → criticalPendingsLoader → Supabase
 */

import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Undo2, UserX, GitBranch, AlertCircle, ShieldCheck } from 'lucide-react';
import { useCriticalPendings } from '../hooks/useCriticalPendings';
import type { CriticalPending, CriticalPendingKind } from '../hooks/useCriticalPendings';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EmptyState } from '@/components/EmptyState';

const KIND_CONFIG: Record<CriticalPendingKind, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeClass: string;
}> = {
  retornada: {
    label: 'Devolvida',
    icon: Undo2,
    badgeClass: 'bg-orange-100 text-orange-800 border border-orange-200',
  },
  sem_aprovador: {
    label: 'Sem Aprovador',
    icon: UserX,
    badgeClass: 'bg-red-100 text-red-800 border border-red-200',
  },
  sem_etapa: {
    label: 'Sem Etapa',
    icon: GitBranch,
    badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200',
  },
  inconsistencia: {
    label: 'Inconsistência',
    icon: AlertCircle,
    badgeClass: 'bg-purple-100 text-purple-800 border border-purple-200',
  },
};

interface Props {
  /** Somente usuários com permissão de gestão veem este bloco */
  canManage: boolean;
}

export function CriticalPendingWidget({ canManage }: Props) {
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useCriticalPendings();

  // Colaboradores comuns não veem pendências críticas do sistema
  if (!canManage) return null;

  if (isLoading) {
    return (
      <Card className="border-l-4 border-l-destructive">
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Sem pendências críticas"
        description="Nenhuma anomalia detectada nos fluxos ativos."
      />
    );
  }

  return (
    <Card className="border-l-4 border-l-destructive bg-destructive/5 shadow-sm">
      <CardContent className="p-5 space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <h2 className="text-base font-bold text-foreground flex-1">Pendências Críticas</h2>
          <Badge variant="destructive">{items.length}</Badge>
        </div>

        {/* Lista */}
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {items.map(item => {
            const cfg = KIND_CONFIG[item.kind];
            const Icon = cfg.icon;
            return (
              <button
                key={`${item.kind}-${item.id}`}
                onClick={() => item.route ? navigate(item.route) : undefined}
                disabled={!item.route}
                className="w-full text-left flex items-center gap-3 border border-border bg-background rounded-lg p-3 hover:border-destructive hover:bg-destructive/5 transition-all disabled:opacity-60 disabled:cursor-default"
              >
                <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{item.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${cfg.badgeClass}`}>
                  {cfg.label}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
