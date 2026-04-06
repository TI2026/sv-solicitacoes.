import { useAuth } from '@/contexts/AuthContext';
import { useFuelRequests, useSoftDeleteRequest } from '../hooks/useFleetQueries';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useDailyLimitForRole } from '@/hooks/useRequestLimits';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { FUEL_STATUS_LABELS, REQUEST_TYPE_LABELS } from '@/lib/constants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link, useNavigate } from 'react-router-dom';
import { PlusCircle, Loader2, Fuel, Calendar, Info, ChevronDown, Receipt, Briefcase, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const REJECTED_STATUSES = new Set(['reprovado']);
const COMPLETED_STATUSES = new Set(['aprovado', 'concluido', 'encerrado']);
const DIARIA_APPROVED_STATUSES = new Set(['aprovado']);
const DIARIA_COMPLETED_STATUSES = new Set(['concluido', 'encerrado']);

function groupRequests(requests: any[] = []) {
  const rejected = requests.filter((request) => REJECTED_STATUSES.has(request.status));
  const completed = requests.filter((request) => COMPLETED_STATUSES.has(request.status));
  const pending = requests.filter(
    (request) => !REJECTED_STATUSES.has(request.status) && !COMPLETED_STATUSES.has(request.status),
  );

  return { pending, rejected, completed };
}

function groupDiariaRequests(requests: any[] = []) {
  const rejected = requests.filter((request) => REJECTED_STATUSES.has(request.status));
  const approved = requests.filter((request) => DIARIA_APPROVED_STATUSES.has(request.status));
  const completed = requests.filter((request) => DIARIA_COMPLETED_STATUSES.has(request.status));
  const pending = requests.filter(
    (request) =>
      !REJECTED_STATUSES.has(request.status) &&
      !DIARIA_APPROVED_STATUSES.has(request.status) &&
      !DIARIA_COMPLETED_STATUSES.has(request.status),
  );

  return { pending, rejected, approved, completed };
}

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
  const [subFilter, setSubFilter] = useState<'pendentes' | 'negados' | 'aprovadas' | 'concluidos'>('pendentes');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const softDelete = useSoftDeleteRequest();
  const abastLimit = useDailyLimitForRole(user?.roles, 'abastecimento');
  const reembolsoLimit = useDailyLimitForRole(user?.roles, 'reembolso');

  // If activeTab is diaria but user can't see it, force to abastecimento
  if (activeTab === 'diaria' && !canSeeDiaria) {
    setActiveTab('abastecimento');
  }

  const { data: abastData, isLoading: abastLoading } = useFuelRequests(user?.id, isAdmin, 'abastecimento');
  const { data: reembolsoData, isLoading: reembolsoLoading } = useFuelRequests(user?.id, isAdmin, 'reembolso');
  const { data: diariaData, isLoading: diariaLoading } = useFuelRequests(canSeeDiaria ? user?.id : undefined, canSeeDiaria ? isAdmin : false, canSeeDiaria ? 'diaria' : undefined);
  const abastGroups = useMemo(() => groupRequests(abastData), [abastData]);
  const reembolsoGroups = useMemo(() => groupRequests(reembolsoData), [reembolsoData]);
  const diariaGroups = useMemo(() => groupDiariaRequests(diariaData), [diariaData]);

  useRealtimeSubscription({
    channelName: 'fleet-list-realtime',
    enabled: !!user,
    tables: [{ table: 'fuel_requests', queryKeys: [['fuel_requests'], ['fuel_metrics']] }],
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

          {/* Sub-filter: Pendentes / Negados / Concluídos */}
          <div className="flex gap-2 flex-wrap">
            <Button variant={subFilter === 'pendentes' ? 'default' : 'outline'} size="sm" onClick={() => setSubFilter('pendentes')}>
              Pendentes {abastGroups.pending.length ? `(${abastGroups.pending.length})` : ''}
            </Button>
            <Button variant={subFilter === 'negados' ? 'destructive' : 'outline'} size="sm" onClick={() => setSubFilter('negados')}>
              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Negadas {abastGroups.rejected.length ? `(${abastGroups.rejected.length})` : ''}
            </Button>
            <Button variant={subFilter === 'concluidos' ? 'default' : 'outline'} size="sm" onClick={() => setSubFilter('concluidos')}>
              <CheckCircle className="w-3.5 h-3.5 mr-1" /> Concluídas {abastGroups.completed.length ? `(${abastGroups.completed.length})` : ''}
            </Button>
          </div>

          {subFilter === 'pendentes' ? (
            <RequestList requests={abastGroups.pending} isAdmin={isAdmin} isLoading={abastLoading} navigate={navigate} emptyIcon={Fuel} emptyText="Nenhuma solicitação pendente" />
          ) : subFilter === 'negados' ? (
            <RequestList requests={abastGroups.rejected} isAdmin={isAdmin} isLoading={abastLoading} navigate={navigate} emptyIcon={Fuel} emptyText="Nenhuma solicitação negada" canDelete={isAdmin} onDelete={setDeleteTarget} />
          ) : (
            <RequestList requests={abastGroups.completed} isAdmin={isAdmin} isLoading={abastLoading} navigate={navigate} emptyIcon={Fuel} emptyText="Nenhuma solicitação concluída" />
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

          <div className="flex gap-2 flex-wrap">
            <Button variant={subFilter === 'pendentes' ? 'default' : 'outline'} size="sm" onClick={() => setSubFilter('pendentes')}>
              Pendentes {reembolsoGroups.pending.length ? `(${reembolsoGroups.pending.length})` : ''}
            </Button>
            <Button variant={subFilter === 'negados' ? 'destructive' : 'outline'} size="sm" onClick={() => setSubFilter('negados')}>
              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Negadas {reembolsoGroups.rejected.length ? `(${reembolsoGroups.rejected.length})` : ''}
            </Button>
            <Button variant={subFilter === 'concluidos' ? 'default' : 'outline'} size="sm" onClick={() => setSubFilter('concluidos')}>
              <CheckCircle className="w-3.5 h-3.5 mr-1" /> Concluídas {reembolsoGroups.completed.length ? `(${reembolsoGroups.completed.length})` : ''}
            </Button>
          </div>

          {subFilter === 'pendentes' ? (
            <RequestList requests={reembolsoGroups.pending} isAdmin={isAdmin} isLoading={reembolsoLoading} navigate={navigate} emptyIcon={Receipt} emptyText="Nenhuma solicitação pendente" />
          ) : subFilter === 'negados' ? (
            <RequestList requests={reembolsoGroups.rejected} isAdmin={isAdmin} isLoading={reembolsoLoading} navigate={navigate} emptyIcon={Receipt} emptyText="Nenhuma solicitação negada" canDelete={isAdmin} onDelete={setDeleteTarget} />
          ) : (
            <RequestList requests={reembolsoGroups.completed} isAdmin={isAdmin} isLoading={reembolsoLoading} navigate={navigate} emptyIcon={Receipt} emptyText="Nenhuma solicitação concluída" />
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

            <div className="flex gap-2 flex-wrap">
              <Button variant={subFilter === 'pendentes' ? 'default' : 'outline'} size="sm" onClick={() => setSubFilter('pendentes')}>
                Pendentes {diariaGroups.pending.length ? `(${diariaGroups.pending.length})` : ''}
              </Button>
              <Button variant={subFilter === 'negados' ? 'destructive' : 'outline'} size="sm" onClick={() => setSubFilter('negados')}>
                <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Negadas {diariaGroups.rejected.length ? `(${diariaGroups.rejected.length})` : ''}
              </Button>
              <Button variant={subFilter === 'aprovadas' ? 'default' : 'outline'} size="sm" onClick={() => setSubFilter('aprovadas')}>
                <CheckCircle className="w-3.5 h-3.5 mr-1" /> Aprovadas {diariaGroups.approved.length ? `(${diariaGroups.approved.length})` : ''}
              </Button>
              <Button variant={subFilter === 'concluidos' ? 'default' : 'outline'} size="sm" onClick={() => setSubFilter('concluidos')}>
                <CheckCircle className="w-3.5 h-3.5 mr-1" /> Concluídas {diariaGroups.completed.length ? `(${diariaGroups.completed.length})` : ''}
              </Button>
            </div>

            {subFilter === 'pendentes' ? (
              <RequestList requests={diariaGroups.pending} isAdmin={isAdmin} isLoading={diariaLoading} navigate={navigate} emptyIcon={Briefcase} emptyText="Nenhuma diária pendente" canDelete={isAdmin} onDelete={setDeleteTarget} />
            ) : subFilter === 'negados' ? (
              <RequestList requests={diariaGroups.rejected} isAdmin={isAdmin} isLoading={diariaLoading} navigate={navigate} emptyIcon={Briefcase} emptyText="Nenhuma diária negada" canDelete={isAdmin} onDelete={setDeleteTarget} />
            ) : subFilter === 'aprovadas' ? (
              <RequestList requests={diariaGroups.approved} isAdmin={isAdmin} isLoading={diariaLoading} navigate={navigate} emptyIcon={Briefcase} emptyText="Nenhuma diária aprovada" canDelete={isAdmin} onDelete={setDeleteTarget} />
            ) : (
              <RequestList requests={diariaGroups.completed} isAdmin={isAdmin} isLoading={diariaLoading} navigate={navigate} emptyIcon={Briefcase} emptyText="Nenhuma diária concluída" canDelete={isAdmin} onDelete={setDeleteTarget} />
            )}
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
