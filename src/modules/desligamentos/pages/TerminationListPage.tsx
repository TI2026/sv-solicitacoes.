import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useTerminations, useTerminationSetStatus } from '../hooks/useTerminationQueries';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle, UserMinus, Building2, Calendar, Briefcase, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { QuickActionButton } from '@/components/QuickActionButton';

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  em_aprovacao: 'Em Aprovação',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  retornado: 'Devolvido',
  desligamento_concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const TIPO_LABELS: Record<string, string> = {
  pedido_demissao: 'Pedido de Demissão',
  demissao_sem_justa_causa: 'Demissão s/ Justa Causa',
  demissao_por_justa_causa: 'Demissão c/ Justa Causa',
  acordo: 'Acordo',
  termino_contrato: 'Término de Contrato',
  experiencia: 'Experiência',
  aposentadoria: 'Aposentadoria',
  falecimento: 'Falecimento',
  outros: 'Outros',
};

export default function TerminationListPage() {
  const { user, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const canCreate = hasAnyRole(['diretoria', 'administrativo', 'rh']);

  const { data: items = [], isLoading } = useTerminations();
  const setStatusMutation = useTerminationSetStatus();

  useRealtimeSubscription({
    channelName: 'terminations-list-realtime',
    enabled: !!user,
    tables: [
      {
        table: 'termination_requests',
        queryKeys: [['termination_requests'], ['termination_request']],
      },
    ],
  });

  const handleCancel = (id: string) => {
    setStatusMutation.mutate({ requestId: id, toStatus: 'cancelado', reason: 'Cancelado pelo usuário' });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        icon={UserMinus}
        title="Desligamentos"
        subtitle="Gestão de processos de desligamento de colaboradores"
        actions={canCreate ? (
          <Button asChild className="gap-2">
            <Link to="/desligamentos/new">
              <PlusCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Novo Desligamento</span>
            </Link>
          </Button>
        ) : null}
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <UserMinus className="w-12 h-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhum desligamento registrado.</p>
            {canCreate && (
              <Button variant="outline" asChild>
                <Link to="/desligamentos/new">Registrar Desligamento</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item: any) => (
            <Card
              key={item.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/desligamentos/${item.id}`)}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground truncate">
                        {item.collaborator?.full_name ?? '—'}
                      </span>
                      <StatusBadge
                        status={item.status}
                        label={STATUS_LABELS[item.status] ?? item.status}
                      />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {item.collaborator?.role_name && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />
                          {item.collaborator.role_name}
                        </span>
                      )}
                      {item.collaborator?.worksite && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {item.collaborator.worksite}
                        </span>
                      )}
                      {item.data_prevista && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Prev. {new Date(item.data_prevista).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {TIPO_LABELS[item.tipo_desligamento] ?? item.tipo_desligamento}
                    </p>
                  </div>
                  {item.status === 'rascunho' && canCreate && (
                    <QuickActionButton
                      label="Cancelar"
                      icon={XCircle}
                      tone="danger"
                      onClick={(e) => { e.stopPropagation(); handleCancel(item.id); }}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
