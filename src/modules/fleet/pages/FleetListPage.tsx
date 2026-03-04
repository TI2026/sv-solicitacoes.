import { useAuth } from '@/contexts/AuthContext';
import { useFuelRequests } from '../hooks/useFleetQueries';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { FUEL_STATUS_LABELS, REQUEST_TYPE_LABELS } from '@/lib/constants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link, useNavigate } from 'react-router-dom';
import { PlusCircle, Loader2, Fuel, Calendar, Info, ChevronDown, Receipt, Briefcase } from 'lucide-react';
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';

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

function RequestList({ requests, isAdmin, isLoading, navigate, emptyIcon: EmptyIcon, emptyText }: any) {
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
        <Link key={req.id} to={`/fleet/${req.id}`}>
          <Card className="hover:border-primary/30 transition-colors cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
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
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default function FleetListPage() {
  const { user, hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['diretoria', 'administrativo']);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('abastecimento');

  const { data: abastData, isLoading: abastLoading } = useFuelRequests(user?.id, isAdmin, 'abastecimento');
  const { data: reembolsoData, isLoading: reembolsoLoading } = useFuelRequests(user?.id, isAdmin, 'reembolso');
  const { data: diariaData, isLoading: diariaLoading } = useFuelRequests(user?.id, isAdmin, 'diaria');

  useRealtimeSubscription({
    channelName: 'fleet-list-realtime',
    enabled: !!user,
    tables: [{ table: 'fuel_requests', queryKeys: [['fuel_requests'], ['fuel_metrics']] }],
  });

  const canCreateDiaria = hasAnyRole(['diretoria', 'administrativo']);

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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="abastecimento" className="gap-1.5">
            <Fuel className="w-3.5 h-3.5" /> Abastecimento
          </TabsTrigger>
          <TabsTrigger value="reembolso" className="gap-1.5">
            <Receipt className="w-3.5 h-3.5" /> Reembolso
          </TabsTrigger>
          <TabsTrigger value="diaria" className="gap-1.5">
            <Briefcase className="w-3.5 h-3.5" /> Diária
          </TabsTrigger>
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
          <RequestList requests={abastData} isAdmin={isAdmin} isLoading={abastLoading} navigate={navigate} emptyIcon={Fuel} emptyText="Nenhuma solicitação de abastecimento" />
        </TabsContent>

        <TabsContent value="reembolso" className="space-y-3 mt-3">
          <InfoCard title="Como funciona o Reembolso?">
            <p>• Colaborador cria solicitação com categoria, valor e dados de pagamento</p>
            <p>• Diretoria aprova ou rejeita</p>
            <p>• Se aprovado: Diretoria/Admin registra pagamento</p>
            <p>• Solicitação é concluída</p>
            <p>• Limite: 5 solicitações por dia</p>
          </InfoCard>
          <RequestList requests={reembolsoData} isAdmin={isAdmin} isLoading={reembolsoLoading} navigate={navigate} emptyIcon={Receipt} emptyText="Nenhuma solicitação de reembolso" />
        </TabsContent>

        <TabsContent value="diaria" className="space-y-3 mt-3">
          <InfoCard title="Como funciona a Diária?">
            <p>• Disponível apenas para Administração e Diretores</p>
            <p>• Registre categoria, nome, horas e valor</p>
            <p>• A diária pode ser editada ou encerrada</p>
            <p>• Custos são somados por período no dashboard</p>
          </InfoCard>
          <RequestList requests={diariaData} isAdmin={isAdmin} isLoading={diariaLoading} navigate={navigate} emptyIcon={Briefcase} emptyText="Nenhuma diária registrada" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
