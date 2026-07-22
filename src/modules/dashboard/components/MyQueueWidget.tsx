/**
 * MyQueueWidget.tsx
 *
 * CAMADA: Component
 *
 * Responsabilidade: renderizar a fila de aprovação do usuário logado,
 * com resumo numérico no topo (total / urgentes / devolvidas) e lista
 * de itens clicáveis.
 *
 * Regras obrigatórias:
 *  - NUNCA acessar Supabase diretamente.
 *  - NUNCA gerenciar estado de dados (useState/useEffect de carregamento).
 *
 * Padrão: Component (este) → useDashboardQueue → dashboardQueueLoader → Supabase
 */

import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardCheck, Clock, AlertTriangle, Undo2, ArrowRight, Inbox } from 'lucide-react';
import { useDashboardQueue } from '../hooks/useDashboardQueue';
import type { QueueItem } from '../queries/dashboardQueueLoader';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EmptyState } from '@/components/EmptyState';

const MODULE_ROUTE: Record<string, string> = {
  abastecimento: '/fleet',
  reembolso: '/reembolsos',
  diaria: '/diarias',
  admissions: '/admissions',
};

function resolveItemRoute(item: QueueItem): string {
  const base = MODULE_ROUTE[item.module_code ?? ''] ?? '/fleet';
  return `${base}/${item.reference_id}`;
}

interface Props {
  userId: string;
}

export function MyQueueWidget({ userId }: Props) {
  const navigate = useNavigate();
  const { items, summary, isLoading } = useDashboardQueue(userId);

  if (isLoading) {
    return (
      <Card className="border-l-4 border-l-primary">
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (summary.total === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Sua fila está vazia"
        description="Nenhuma solicitação aguarda a sua aprovação no momento."
      />
    );
  }

  return (
    <Card className="border-l-4 border-l-primary bg-primary/5 shadow-sm">
      <CardContent className="p-5 space-y-4">
        {/* Cabeçalho com resumo */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1">
            <ClipboardCheck className="w-5 h-5 text-primary shrink-0" />
            <h2 className="text-base font-bold text-foreground">Minha Fila de Aprovação</h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-primary text-primary-foreground gap-1">
              <Clock className="w-3 h-3" />
              {summary.total} aguardando
            </Badge>
            {summary.urgent > 0 && (
              <Badge className="bg-destructive text-destructive-foreground gap-1 animate-pulse">
                <AlertTriangle className="w-3 h-3" />
                {summary.urgent} urgente{summary.urgent > 1 ? 's' : ''}
              </Badge>
            )}
            {summary.returned > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Undo2 className="w-3 h-3" />
                {summary.returned} devolvida{summary.returned > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* Lista de itens */}
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {items.slice(0, 12).map(item => (
            <button
              key={item.id}
              onClick={() => navigate(resolveItemRoute(item))}
              className="w-full text-left flex items-center justify-between gap-3 border border-border bg-background rounded-lg p-3.5 hover:border-primary hover:bg-primary/5 transition-all group"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">
                  {item.module_name ?? 'Solicitação'}
                  {item.current_step_order && (
                    <span className="text-xs text-muted-foreground ml-2 font-normal">
                      · etapa {item.current_step_order}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {item.requester_name ?? '—'}
                  <span className="mx-1.5">·</span>
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
            </button>
          ))}

          {items.length > 12 && (
            <p className="text-xs text-muted-foreground text-center pt-1">
              Mostrando 12 de {items.length}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
