/**
 * MyRequestsWidget.tsx
 *
 * CAMADA: Component
 *
 * Responsabilidade: renderizar as solicitações do usuário logado,
 * agrupadas por categoria de status operacional.
 *
 * Grupos (ordenados por relevância):
 *   - Em Aprovação / Em andamento
 *   - Devolvidas (exigem ação do usuário)
 *   - Concluídas
 *   - Canceladas
 *
 * Regras obrigatórias:
 *  - NUNCA acessar Supabase diretamente.
 *  - NUNCA gerenciar estado de dados.
 *
 * Padrão: Component (este) → useMyRequests → myRequestsLoader → Supabase
 */

import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FolderOpen, ChevronRight, ExternalLink } from 'lucide-react';
import { useMyRequests } from '../hooks/useMyRequests';
import type { MyRequest } from '../hooks/useMyRequests';
import { StatusBadge } from '@/components/StatusBadge';
import { FUEL_STATUS_LABELS } from '@/lib/constants';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface GroupSectionProps {
  title: string;
  items: MyRequest[];
  emptyHidden?: boolean;
  navigate: (path: string) => void;
}

function GroupSection({ title, items, emptyHidden = true, navigate }: GroupSectionProps) {
  if (emptyHidden && items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
        <span className="text-xs font-bold text-foreground bg-muted rounded-full px-1.5">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-1">Nenhuma</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 5).map(item => (
            <button
              key={item.id}
              onClick={() => navigate(item.route)}
              className="w-full text-left flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:border-primary hover:bg-primary/5 transition-all group text-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground truncate">{item.module}</span>
                  <StatusBadge
                    status={item.status}
                    label={FUEL_STATUS_LABELS[item.status] ?? item.status}
                    withIcon={false}
                  />
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.valor != null && (
                    <span className="text-xs text-muted-foreground">{formatCurrency(item.valor)}</span>
                  )}
                  {item.description && (
                    <span className="text-xs text-muted-foreground truncate">{item.description}</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
            </button>
          ))}
          {items.length > 5 && (
            <p className="text-xs text-muted-foreground pl-1">+{items.length - 5} mais</p>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  userId: string;
}

export function MyRequestsWidget({ userId }: Props) {
  const navigate = useNavigate();
  const { grouped, total, isLoading } = useMyRequests(userId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        {/* Cabeçalho */}
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-muted-foreground shrink-0" />
          <h2 className="text-base font-bold text-foreground flex-1">Minhas Solicitações</h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={() => navigate('/fleet?filter=minhas')}
          >
            Ver todas <ExternalLink className="w-3 h-3" />
          </Button>
        </div>

        {total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Você ainda não abriu nenhuma solicitação.
          </p>
        ) : (
          <div className="space-y-4">
            <GroupSection title="Em andamento / Aprovação" items={grouped.em_aprovacao} navigate={navigate} />
            <GroupSection title="Devolvidas — ação necessária" items={grouped.devolvida} navigate={navigate} />
            <GroupSection title="Concluídas" items={grouped.concluida} navigate={navigate} />
            <GroupSection title="Canceladas / Reprovadas" items={grouped.cancelada} navigate={navigate} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
