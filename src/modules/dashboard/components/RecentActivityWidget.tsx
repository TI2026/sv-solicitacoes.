/**
 * RecentActivityWidget.tsx
 *
 * CAMADA: Component
 *
 * Responsabilidade: renderizar o feed das últimas 30 movimentações
 * do sistema (transições de status), lidas de status_history.
 *
 * Sem scroll infinito. Sem paginação. LIMIT 30 fixo no loader.
 *
 * Regras obrigatórias:
 *  - NUNCA acessar Supabase diretamente.
 *  - NUNCA gerenciar estado de dados.
 *
 * Padrão: Component (este) → useRecentActivity → recentActivityLoader → Supabase
 */

import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity } from 'lucide-react';
import { useRecentActivity } from '../hooks/useRecentActivity';
import { getStatusVisual } from '@/lib/statusVisuals';
import { FUEL_STATUS_LABELS, ADMISSION_STATUS_LABELS } from '@/lib/constants';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EmptyState } from '@/components/EmptyState';

const ENTITY_LABELS: Record<string, string> = {
  fuel_requests: 'Frota',
  admission_requests: 'Admissão',
};

function getStatusLabel(entityType: string, status: string): string {
  if (entityType === 'fuel_requests') return FUEL_STATUS_LABELS[status] ?? status;
  if (entityType === 'admission_requests') return ADMISSION_STATUS_LABELS[status] ?? status;
  return status;
}

export function RecentActivityWidget() {
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useRecentActivity();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-6 w-44" />
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="Sem movimentações recentes"
        description="As últimas transições de status aparecerão aqui assim que houver atividade."
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-muted-foreground shrink-0" />
          <h2 className="text-base font-bold text-foreground">Últimas Movimentações</h2>
          <span className="ml-auto text-xs text-muted-foreground">últimas {items.length}</span>
        </div>

        {/* Feed */}
        <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
          {items.map(item => {
            const visual = getStatusVisual(item.to_status);
            const Icon = visual.Icon;
            const entityLabel = ENTITY_LABELS[item.entity_type] ?? item.entity_type;
            const statusLabel = getStatusLabel(item.entity_type, item.to_status);
            const isClickable = !!item.route;

            return (
              <button
                key={item.id}
                onClick={() => isClickable ? navigate(item.route!) : undefined}
                disabled={!isClickable}
                className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors disabled:cursor-default group"
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${visual.badgeClass}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">
                    <span className="font-medium">{item.actor_name ?? 'Sistema'}</span>
                    <span className="text-muted-foreground"> moveu </span>
                    <span className="font-medium">{entityLabel}</span>
                    <span className="text-muted-foreground"> para </span>
                    <span className={`font-medium ${visual.badgeClass.replace('border', '').replace('bg-', 'text-').replace(/\s+\w+-\d+/, '').trim()}`}>
                      {statusLabel}
                    </span>
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
