import { useQuery } from '@tanstack/react-query';
import { ExportReportDialog } from '@/components/ExportReportDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ClipboardCheck, ListChecks, ShieldAlert, Download } from 'lucide-react';
import { ROLE_LABELS } from '@/types';
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// New Blocks
import { FuelMetricsBlock } from '@/modules/dashboard/components/FuelMetricsBlock';
import { AdmissionMetricsBlock } from '@/modules/dashboard/components/AdmissionMetricsBlock';
import { FlowControlPanel } from '@/modules/dashboard/components/FlowControlPanel';

export default function DashboardPage() {
  const { user, hasAnyRole, isMaster } = useAuth();
  const navigate = useNavigate();
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [exportOpen, setExportOpen] = useState(false);

  const isRH = hasAnyRole(['diretoria', 'rh']);
  const isAdmin = hasAnyRole(['diretoria', 'administrativo']);
  const canSeeFinancials = !!isMaster;

  // Track online presence for master users
  useEffect(() => {
    if (!isMaster || !user) return;
    const channel = supabase.channel('online-users');
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const users = Object.values(state).flat().map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        avatar_url: p.avatar_url,
        role: p.role || 'colaborador',
        current_route: p.current_route || '/',
      }));
      const unique = Array.from(new Map(users.map(u => [u.user_id, u])).values());
      setOnlineUsers(unique);
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isMaster, user]);

  useRealtimeSubscription({
    channelName: `dashboard-realtime-${user?.id}`,
    enabled: !!user,
    tables: [
      { table: 'fuel_requests', queryKeys: [['dashboard_metrics']] },
      { table: 'admission_requests', queryKeys: [['dashboard_metrics']] },
      { 
        table: 'approval_requests', 
        filter: `current_approver_user_id=eq.${user?.id}`,
        queryKeys: [['dashboard_approvals'], ['my_approvals']] 
      },
      { table: 'approval_request_steps', queryKeys: [['dashboard_approvals'], ['my_approvals'], ['all_approval_requests'], ['approval_request_for']] },
      { table: 'notifications', queryKeys: [['dashboard_approvals']] },
    ],
  });

  // Approval requests for current user
  const { data: approvalData } = useQuery({
    queryKey: ['dashboard_approvals', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_requests')
        .select('id, status, current_approver_user_id, requester_user_id, reference_id, ended_at, current_step_order, created_at, approval_modules(code, name), profiles!approval_requests_requester_user_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const approvalMetrics = useMemo(() => {
    const d = (approvalData || []).filter((a: any) => a.status !== 'cancelled');
    const active = d.filter((a: any) => !a.ended_at);
    const myPending = active.filter((a: any) => a.current_approver_user_id === user?.id);
    return { myPending };
  }, [approvalData, user?.id]);

  // Use the new SECURITY INVOKER RPC for metrics aggregation
  const { data: metricsObj, isLoading: metricsLoading } = useQuery({
    queryKey: ['dashboard_metrics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_metrics' as any);
      if (error || !data) {
        console.error('[Dashboard] RPC metrics error:', error);
        return {
          isError: true,
          fuel: { total: 0, pendentes: 0, aprovados: 0, valor_total: 0, aguardando_oc: 0, aguardando_pagamento: 0, em_revisao_admin: 0, by_status: [], by_type: [] },
          admission: { total: 0, em_andamento: 0, aguardando_registros: 0, active_cost: 0, by_status: [] }
        };
      }
      return { isError: false, ...data } as any;
    },
    enabled: !!user,
  });

  const metrics = metricsObj || { fuel: null, admission: null, isError: false };

  if (!user) return null;
  const primaryRole = user.roles[0];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Olá, {user.full_name || 'Usuário'}!</h1>
          <p className="text-muted-foreground mt-1">
            {primaryRole ? ROLE_LABELS[primaryRole] : 'Sem papel'}
            {user.department && <> · {user.department}</>}
            {isMaster && <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-800"><ShieldAlert className="w-3 h-3" />Master</span>}
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setExportOpen(true)}>
            <Download className="w-4 h-4" /> Exportar
          </Button>
        )}
      </div>

      {isAdmin && <ExportReportDialog open={exportOpen} onOpenChange={setExportOpen} />}

      {metrics?.isError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-4">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <h4 className="font-semibold text-sm">Dashboard em modo de compatibilidade</h4>
            <p className="text-xs mt-1 text-amber-700/90">
              A função de alta performance (RPC) ainda não foi detectada no banco de dados. Os indicadores numéricos abaixo estão em modo demonstração até a atualização.
            </p>
          </div>
        </div>
      )}

      {/* ===== Fila de Aprovação ===== */}
      {isMaster && approvalMetrics.myPending.length > 0 && (
        <Card className="border-2 border-primary/40 bg-primary/5 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-primary" />
                Ações Pendentes — sua aprovação
                <Badge className="ml-1 bg-amber-500 text-white animate-pulse">{approvalMetrics.myPending.length}</Badge>
              </h3>
              <Button size="sm" variant="outline" onClick={() => navigate('/permissoes?tab=minhas-aprovacoes')}>
                Abrir Minhas Aprovações
              </Button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {approvalMetrics.myPending.slice(0, 12).map((ar: any) => {
                const moduleCode = ar.approval_modules?.code as string | undefined;
                const isFleet = moduleCode === 'abastecimento' || moduleCode === 'reembolso' || moduleCode === 'diaria';
                const route = isFleet
                  ? `/fleet/${ar.reference_id}`
                  : moduleCode === 'admissao'
                    ? `/admissions/${ar.reference_id}`
                    : `/permissoes?tab=minhas-aprovacoes`;
                return (
                  <button
                    key={ar.id}
                    onClick={() => navigate(route)}
                    className="w-full text-left flex items-center justify-between gap-3 border border-border bg-background rounded-lg p-3.5 hover:border-primary hover:bg-primary/5 transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-foreground truncate">
                        {ar.approval_modules?.name || 'Solicitação'}
                        <span className="text-sm text-muted-foreground ml-2 font-normal">· etapa {ar.current_step_order}</span>
                      </p>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        Solicitante: <span className="font-medium text-foreground/85">{ar.profiles?.full_name || '—'}</span>
                        <span className="mx-1.5">·</span>
                        {new Date(ar.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <Badge className="bg-amber-500 text-white shrink-0">Aguardando você</Badge>
                  </button>
                );
              })}
              {approvalMetrics.myPending.length > 12 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  Mostrando 12 de {approvalMetrics.myPending.length}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full sm:w-auto flex-wrap">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          {isRH && <TabsTrigger value="admissions">Admissões</TabsTrigger>}
          {isAdmin && <TabsTrigger value="fluxos" className="gap-1"><ListChecks className="w-3.5 h-3.5" /> Fluxos</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {metricsLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : (
            <FuelMetricsBlock metrics={metrics?.fuel} canSeeFinancials={canSeeFinancials} />
          )}
        </TabsContent>

        {isRH && (
          <TabsContent value="admissions" className="space-y-4 mt-4">
            {metricsLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
              </div>
            ) : (
              <AdmissionMetricsBlock metrics={metrics?.admission} canSeeFinancials={canSeeFinancials} />
            )}
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="fluxos" className="space-y-4 mt-4">
            <FlowControlPanel navigate={navigate} isRH={isRH} canSeeFinancials={canSeeFinancials} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
