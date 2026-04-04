import { useAuth } from '@/contexts/AuthContext';
import { useFuelRequestsPending, useFuelRequestsRejected, useFuelRequests, useSoftDeleteRequest } from '../hooks/useFleetQueries';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { FUEL_STATUS_LABELS, REQUEST_TYPE_LABELS } from '@/lib/constants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link, useNavigate } from 'react-router-dom';
import { PlusCircle, Loader2, Fuel, Calendar, Info, ChevronDown, Receipt, Briefcase, Trash2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-primary/20 bg-primary/5">
        <CollapsibleTrigger asChild>
          <CardContent className="p-3 flex items-center gap-2 cursor-pointer">
            <Info className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-medium text-foreground flex-1">{title}</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </CardContent>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-3 pb-3 pt-0 text-xs text-muted-foreground space-y-1">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function RequestList({ requests, isAdmin, isLoading, navigate, emptyIcon: EmptyIcon, emptyText, canDelete, onDelete }: any) {
  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
    </div>
  );
  if (!requests || requests.length === 0) return (
    <Card>
      <CardContent className="py-12 text-center">
        <EmptyIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </CardContent>
    </Card>
  );
  return (
    <div className="space-y-3">
      {requests.map((req: any) => (
        <Card key={req.id} className="hover:border-primary/30 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <Link to={`/fleet/${req.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">
                    R$ {Number(req.valor || req.daily_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <StatusBadge status={req.status} label={FUEL_STATUS_LABELS[req.status] || req.status} />
                  {req.type !== 'abastecimento' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                      {REQUEST_TYPE_LABELS[req.type] || req.type}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
<span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(req.data_abastecimento).toLocaleDateString('pt-BR')}
                  </span>
                  {req.placa && <span>🚗 {req.placa}</span>}
                  {req.categoria && <span>{req.categoria}</span>}
                  {req.person_name && <span>{req.person_name}</span>}
                  {isAdmin && req.profiles && <span>{req.profiles.full_name}</span>}
                  {isAdmin && (req as any).assignee?.full_name && ['enviado', 'em_revisao'].includes(req.status) && (
                    <span className="text-primary font-medium">📋 {(req as any).assignee.full_name}</span>
                  )}
                </div>
              </Link>
              {canDelete && (
                <Button variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive" onClick={(e) => { e.preventDefault(); onDelete?.(req); }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function FleetListPage() {
  const { user, hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['diretoria', 'administrativo']);
  const canSeeDiaria = hasAnyRole(['diretoria', 'administrativo']);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('abastecimento');
  const [subFilter, setSubFilter] = useState<'pendentes' | 'negados' | 'concluidos'>('pendentes');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const softDelete = useSoftDeleteRequest();

  // If activeTab is diaria but user can't see it, force to abastecimento
  if (activeTab === 'diaria' && !canSeeDiaria) {
    setActiveTab('abastecimento');
  }

  // Pending queries
  const { data: abastPending, isLoading: abastPendingLoading } = useFuelRequestsPending(user?.id, isAdmin, 'abastecimento');
  const { data: reembolsoPending, isLoading: reembolsoPendingLoading } = useFuelRequestsPending(user?.id, isAdmin, 'reembolso');
  // Diaria: only load if user can see it
  const { data: diariaData, isLoading: diariaLoading } = useFuelRequests(canSeeDiaria ? user?.id : undefined, canSeeDiaria ? isAdmin : false, canSeeDiaria ? 'diaria' : undefined);

  // Rejected queries
  const { data: abastRejected, isLoading: abastRejectedLoading } = useFuelRequestsRejected(user?.id, isAdmin, 'abastecimento');
  const { data: reembolsoRejected, isLoading: reembolsoRejectedLoading } = useFuelRequestsRejected(user?.id, isAdmin, 'reembolso');

  // Completed queries
  const { data: abastCompleted, isLoading: abastCompletedLoading } = useFuelRequestsCompleted(user?.id, isAdmin, 'abastecimento');
  const { data: reembolsoCompleted, isLoading: reembolsoCompletedLoading } = useFuelRequestsCompleted(user?.id, isAdmin, 'reembolso');

  useRealtimeSubscription({
    channelName: 'fleet-list-realtime',
    enabled: !!user,
    tables: [{ table: 'fuel_requests', queryKeys: [['fuel_requests'], ['fuel_requests_pending'], ['fuel_requests_rejected'], ['fuel_requests_completed'], ['fuel_metrics']] }],
  });

  const canCreateDiaria = canSeeDiaria;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await softDelete.mutateAsync({ requestId: deleteTarget.id });
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Solicitações</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdmin ? 'Todas as solicitações' : 'Suas solicitações'}
          </p>
        </div>
        {(activeTab !== 'diaria' || canCreateDiaria) && (
          <Button onClick={() => navigate(`/fleet/new?type=${activeTab}`)} className="gap-2">
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Nova</span>
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSubFilter('pendentes'); }} className="w-full">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="abastecimento" className="gap-1.5">
            <Fuel className="w-3.5 h-3.5" /> Abastecimento
          </TabsTrigger>
          <TabsTrigger value="reembolso" className="gap-1.5">
            <Receipt className="w-3.5 h-3.5" /> Reembolso
          </TabsTrigger>
          {canSeeDiaria && (
            <TabsTrigger value="diaria" className="gap-1.5">
              <Briefcase className="w-3.5 h-3.5" /> Diária
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="abastecimento" className="space-y-3 mt-3">
          <InfoCard title="Como funciona o Abastecimento?">
            <p>• Colaborador cria solicitação com placa, km e valor</p>
            <p>• Diretoria aprova ou rejeita</p>
            <p>• Se aprovado: aguarda recarga do cartão (Administrativo)</p>
            <p>• Colaborador anexa foto do hodômetro e nota fiscal</p>
            <p>• Administrativo revisa e conclui</p>
            <p>• Limite: 5 solicitações por dia</p>
          </InfoCard>

          {/* Sub-filter: Pendentes / Negados */}
          <div className="flex gap-2">
            <Button variant={subFilter === 'pendentes' ? 'default' : 'outline'} size="sm" onClick={() => setSubFilter('pendentes')}>
              Pendentes {abastPending?.length ? `(${abastPending.length})` : ''}
            </Button>
            <Button variant={subFilter === 'negados' ? 'destructive' : 'outline'} size="sm" onClick={() => setSubFilter('negados')}>
              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Negados {abastRejected?.length ? `(${abastRejected.length})` : ''}
            </Button>
          </div>

          {subFilter === 'pendentes' ? (
            <RequestList requests={abastPending} isAdmin={isAdmin} isLoading={abastPendingLoading} navigate={navigate} emptyIcon={Fuel} emptyText="Nenhuma solicitação pendente" />
          ) : (
            <RequestList requests={abastRejected} isAdmin={isAdmin} isLoading={abastRejectedLoading} navigate={navigate} emptyIcon={Fuel} emptyText="Nenhuma solicitação negada" canDelete={isAdmin} onDelete={setDeleteTarget} />
          )}
        </TabsContent>

        <TabsContent value="reembolso" className="space-y-3 mt-3">
          <InfoCard title="Como funciona o Reembolso?">
            <p>• Colaborador cria solicitação com categoria, valor e dados de pagamento</p>
            <p>• Diretoria aprova ou rejeita</p>
            <p>• Se aprovado: Diretoria/Admin registra pagamento</p>
            <p>• Solicitação é concluída</p>
            <p>• Limite: 5 solicitações por dia</p>
          </InfoCard>

          <div className="flex gap-2">
            <Button variant={subFilter === 'pendentes' ? 'default' : 'outline'} size="sm" onClick={() => setSubFilter('pendentes')}>
              Pendentes {reembolsoPending?.length ? `(${reembolsoPending.length})` : ''}
            </Button>
            <Button variant={subFilter === 'negados' ? 'destructive' : 'outline'} size="sm" onClick={() => setSubFilter('negados')}>
              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Negados {reembolsoRejected?.length ? `(${reembolsoRejected.length})` : ''}
            </Button>
          </div>

          {subFilter === 'pendentes' ? (
            <RequestList requests={reembolsoPending} isAdmin={isAdmin} isLoading={reembolsoPendingLoading} navigate={navigate} emptyIcon={Receipt} emptyText="Nenhuma solicitação pendente" />
          ) : (
            <RequestList requests={reembolsoRejected} isAdmin={isAdmin} isLoading={reembolsoRejectedLoading} navigate={navigate} emptyIcon={Receipt} emptyText="Nenhuma solicitação negada" canDelete={isAdmin} onDelete={setDeleteTarget} />
          )}
        </TabsContent>

        {canSeeDiaria && (
          <TabsContent value="diaria" className="space-y-3 mt-3">
            <InfoCard title="Como funciona a Diária?">
              <p>• Disponível apenas para Administração e Diretores</p>
              <p>• Registre categoria, nome, horas e valor</p>
              <p>• A diária pode ser editada ou encerrada</p>
              <p>• Custos são somados por período no dashboard</p>
            </InfoCard>
            <RequestList requests={diariaData} isAdmin={isAdmin} isLoading={diariaLoading} navigate={navigate} emptyIcon={Briefcase} emptyText="Nenhuma diária registrada" canDelete={isAdmin} onDelete={setDeleteTarget} />
          </TabsContent>
        )}
      </Tabs>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" /> Excluir solicitação
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza? Isso só oculta do app (pode ser restaurado por auditoria). O registro não será apagado fisicamente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={softDelete.isPending}>
              {softDelete.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
