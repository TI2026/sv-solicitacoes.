import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTermination, useTerminationSetStatus } from '../hooks/useTerminationQueries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, UserMinus, Building2, Calendar, Briefcase, User, Hash, Clock } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  em_aprovacao: 'Em Aprovação',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  retornado: 'Devolvido',
  desligamento_concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  rascunho: 'outline',
  em_aprovacao: 'secondary',
  aprovado: 'default',
  reprovado: 'destructive',
  retornado: 'secondary',
  desligamento_concluido: 'default',
  cancelado: 'destructive',
};

const TIPO_LABELS: Record<string, string> = {
  pedido_demissao: 'Pedido de Demissão',
  demissao_sem_justa_causa: 'Demissão sem Justa Causa',
  demissao_por_justa_causa: 'Demissão por Justa Causa',
  acordo: 'Acordo',
  termino_contrato: 'Término de Contrato',
  experiencia: 'Término de Experiência',
  aposentadoria: 'Aposentadoria',
  falecimento: 'Falecimento',
  outros: 'Outros',
};

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium text-foreground">{value}</span>
      </div>
    </div>
  );
}

export default function TerminationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasAnyRole } = useAuth();
  const { data: item, isLoading } = useTermination(id!);
  const setStatusMutation = useTerminationSetStatus();
  const canManage = hasAnyRole(['diretoria', 'administrativo', 'rh']);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" className="gap-2" onClick={() => navigate('/desligamentos')}>
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Desligamento não encontrado.
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSendToApproval = () => {
    if (!user) return;
    setStatusMutation.mutate({
      requestId: item.id,
      toStatus: 'em_aprovacao',
      startApproval: { requesterUserId: user.id },
    });
  };

  const handleConclude = () => {
    setStatusMutation.mutate({ requestId: item.id, toStatus: 'desligamento_concluido' });
  };

  const handleCancel = () => {
    setStatusMutation.mutate({ requestId: item.id, toStatus: 'cancelado', reason: 'Cancelado manualmente' });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <Button variant="ghost" className="gap-2" onClick={() => navigate('/desligamentos')}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <UserMinus className="w-5 h-5 text-primary" />
                {item.collaborator?.full_name ?? 'Colaborador'}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {TIPO_LABELS[item.tipo_desligamento] ?? item.tipo_desligamento}
              </p>
            </div>
            <Badge variant={STATUS_VARIANTS[item.status] ?? 'outline'}>
              {STATUS_LABELS[item.status] ?? item.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dados do colaborador */}
          <div className="space-y-2 border-b pb-4">
            <h3 className="text-sm font-semibold text-foreground">Dados do Colaborador</h3>
            <InfoRow icon={Briefcase} label="Cargo" value={item.collaborator?.role_name} />
            <InfoRow icon={Building2} label="Empresa" value={item.collaborator?.worksite} />
            <InfoRow icon={Building2} label="Setor" value={item.collaborator?.sector?.name} />
            <InfoRow icon={Hash} label="Matrícula" value={item.matricula} />
            <InfoRow icon={User} label="Gestor Imediato" value={item.gestor_imediato} />
          </div>

          {/* Dados do desligamento */}
          <div className="space-y-2 border-b pb-4">
            <h3 className="text-sm font-semibold text-foreground">Processo de Desligamento</h3>
            <InfoRow icon={Calendar} label="Data Prevista" value={item.data_prevista ? new Date(item.data_prevista).toLocaleDateString('pt-BR') : null} />
            <InfoRow icon={Clock} label="Último Dia Trabalhado" value={item.ultimo_dia_trabalhado ? new Date(item.ultimo_dia_trabalhado).toLocaleDateString('pt-BR') : null} />
            <div className="text-sm">
              <span className="text-muted-foreground">Motivo: </span>
              <span className="font-medium text-foreground">{item.motivo}</span>
            </div>
            {item.observacoes && (
              <div className="text-sm">
                <span className="text-muted-foreground">Observações: </span>
                <span className="text-foreground">{item.observacoes}</span>
              </div>
            )}
          </div>

          {/* Solicitante */}
          <div className="text-sm text-muted-foreground">
            Aberto por <span className="text-foreground font-medium">{item.requester?.full_name ?? '—'}</span>{' '}
            em {new Date(item.created_at).toLocaleDateString('pt-BR')}
          </div>

          {/* Ações */}
          {canManage && (
            <div className="flex flex-wrap gap-3 pt-2">
              {item.status === 'rascunho' && (
                <Button onClick={handleSendToApproval} disabled={setStatusMutation.isPending}>
                  Enviar para Aprovação
                </Button>
              )}
              {item.status === 'aprovado' && (
                <Button onClick={handleConclude} disabled={setStatusMutation.isPending}>
                  Concluir Desligamento
                </Button>
              )}
              {['rascunho', 'retornado', 'aprovado'].includes(item.status) && (
                <Button
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={setStatusMutation.isPending}
                >
                  Cancelar Solicitação
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
