import { useQuery } from '@tanstack/react-query';
import { ExportReportDialog } from '@/components/ExportReportDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePresence } from '@/contexts/PresenceContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Loader2, ShieldAlert, Download, ArrowUp, AlertTriangle, Clock, CheckCircle2, DollarSign, Users, Activity } from 'lucide-react';
import { ROLE_LABELS } from '@/types';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// Widgets da Central Operacional (Sprint 7)
import { MyRequestsWidget } from '@/modules/dashboard/components/MyRequestsWidget';
import { RecentActivityWidget } from '@/modules/dashboard/components/RecentActivityWidget';
import { QuickAccessWidget } from '@/modules/dashboard/components/QuickAccessWidget';
import { MyQueueWidget } from '@/modules/dashboard/components/MyQueueWidget';
import { CriticalPendingWidget } from '@/modules/dashboard/components/CriticalPendingWidget';

import { FuelMetricsBlock } from '@/modules/dashboard/components/FuelMetricsBlock';
import { AdmissionMetricsBlock } from '@/modules/dashboard/components/AdmissionMetricsBlock';
// PurchaseMetricsBlock removido na Sprint 13.9 — tabela `purchases` inexistente.
// Reativar na Sprint 14 quando o módulo Compras tiver persistência operacional.
import { FlowControlPanel } from '@/modules/dashboard/components/FlowControlPanel';

export default function DashboardPage() {
  const { user, hasAnyRole, isMaster } = useAuth();
  const navigate = useNavigate();
  const { onlineUsers } = usePresence();
  const [exportOpen, setExportOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Permissões derivadas do perfil
  const isRH = hasAnyRole(['diretoria', 'rh']);
  const isAdmin = hasAnyRole(['diretoria', 'administrativo']);
  const canSeeFinancials = !!isMaster;
  const canViewAdmissions = hasAnyRole(['diretoria', 'rh', 'administrativo']);

  // ─── Realtime — invalida todos os widgets reativos ────────────────────────
  useRealtimeSubscription({
    channelName: `dashboard-realtime-${user?.id}`,
    enabled: !!user,
    tables: [
      // Métricas globais
      { table: 'fuel_requests',          queryKeys: [['dashboard_metrics'], ['my_requests', user?.id]] },
      { table: 'admission_requests',     queryKeys: [['dashboard_metrics'], ['my_requests', user?.id]] },
      { table: 'purchases',              queryKeys: [['my_requests', user?.id]] },
      // Fila de aprovação + pendências críticas
      {
        table: 'approval_requests',
        filter: `current_approver_user_id=eq.${user?.id}`,
        queryKeys: [['my_approvals', user?.id], ['dashboard_approvals']],
      },
      // Qualquer mudança em approval_requests (para critical_pendings)
      { table: 'approval_requests',      queryKeys: [['critical_pendings']] },
      { table: 'approval_request_steps', queryKeys: [['my_approvals', user?.id], ['dashboard_approvals'], ['all_approval_requests'], ['approval_request_for']] },
      { table: 'notifications',          queryKeys: [['dashboard_approvals']] },
      // Feed de atividades recentes
      { table: 'status_history',         queryKeys: [['recent_activity'], ['my_requests', user?.id]] },
    ],
  });

  // ─── Métricas (RPC existente) ─────────────────────────────────────────────
  const { data: metricsObj, isLoading: metricsLoading } = useQuery({
    queryKey: ['dashboard_metrics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_metrics' as any);
      if (error || !data) {
        return {
          isError: true,
          fuel: { total: 0, pendentes: 0, aprovados: 0, valor_total: 0, aguardando_oc: 0, aguardando_pagamento: 0, em_revisao_admin: 0, by_status: [], by_type: [] },
          admission: { total: 0, em_andamento: 0, aguardando_registros: 0, active_cost: 0, by_status: [] },
        };
      }
      return { isError: false, ...data } as any;
    },
    enabled: !!user,
  });

  const metrics = metricsObj || { fuel: null, admission: null, isError: false };

  if (!user) return <div className="flex h-64 items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const primaryRole = user.roles[0];

  // Visão Geral — KPIs consolidados a partir das métricas existentes
  const overviewKpis = [
    {
      label: 'Total de Solicitações',
      value: (metrics?.fuel?.total ?? 0) + (metrics?.admission?.total ?? 0),
      icon: Activity,
      tone: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Aguardando Aprovação',
      value: metrics?.fuel?.pendentes ?? 0,
      icon: Clock,
      tone: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'Aprovados',
      value: metrics?.fuel?.aprovados ?? 0,
      icon: CheckCircle2,
      tone: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Aguardando Pagamento',
      value: metrics?.fuel?.aguardando_pagamento ?? 0,
      icon: DollarSign,
      tone: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Devolvidas / Em Revisão',
      value: metrics?.fuel?.em_revisao_admin ?? 0,
      icon: AlertTriangle,
      tone: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      label: 'Usuários Ativos Agora',
      value: onlineUsers?.length ?? 0,
      icon: Users,
      tone: 'text-fuchsia-600',
      bg: 'bg-fuchsia-50',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-16">

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Olá, {user.full_name || 'Usuário'}!
          </h1>
          <p className="text-muted-foreground mt-1">
            {primaryRole ? ROLE_LABELS[primaryRole] : 'Sem papel'}
            {user.department && <> · {user.department}</>}
            {isMaster && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-800">
                <ShieldAlert className="w-3 h-3" />Master
              </span>
            )}
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setExportOpen(true)}>
            <Download className="w-4 h-4" /> Exportar
          </Button>
        )}
      </div>

      {isAdmin && <ExportReportDialog open={exportOpen} onOpenChange={setExportOpen} />}

      {/* ── Aviso de compatibilidade da RPC ───────────────────────────────── */}
      {metrics?.isError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <h4 className="font-semibold text-sm">Dashboard em modo de compatibilidade</h4>
            <p className="text-xs mt-1 text-amber-700/90">
              A função de alta performance (RPC) ainda não foi detectada. Os indicadores estão em modo demonstração.
            </p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          DASHBOARD ENTERPRISE — RC Final:
          5 abas executivas (Geral · Operacional · Financeiro · Aprovações · Indicadores)
      ══════════════════════════════════════════════════════════════════════ */}
      <Tabs defaultValue="geral" className="w-full">
        <TabsList className="w-full flex flex-wrap justify-start h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="geral" className="flex-1 min-w-[110px]">Geral</TabsTrigger>
          <TabsTrigger value="operacional" className="flex-1 min-w-[110px]">Operacional</TabsTrigger>
          {canSeeFinancials && (
            <TabsTrigger value="financeiro" className="flex-1 min-w-[110px]">Financeiro</TabsTrigger>
          )}
          <TabsTrigger value="aprovacoes" className="flex-1 min-w-[110px]">Aprovações</TabsTrigger>
          <TabsTrigger value="indicadores" className="flex-1 min-w-[110px]">Indicadores</TabsTrigger>
        </TabsList>

        {/* ─── GERAL ─────────────────────────────────────────────────────── */}
        <TabsContent value="geral" className="space-y-6 mt-6">
          {/* Visão Geral */}
          <section aria-labelledby="dash-visao" className="space-y-3">
            <h2 id="dash-visao" className="text-lg font-semibold text-foreground border-b pb-2">
              Visão Geral
            </h2>
            {metricsLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                {overviewKpis.map(k => {
                  const Icon = k.icon;
                  return (
                    <div key={k.label} className="border rounded-lg p-4 bg-card flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${k.bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`w-5 h-5 ${k.tone}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground truncate">{k.label}</p>
                        <p className="text-2xl font-bold text-foreground leading-tight">{k.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Acesso rápido + Minhas solicitações */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-3">
              <h2 className="text-lg font-semibold text-foreground border-b pb-2">Minhas Solicitações</h2>
              <MyRequestsWidget userId={user.id} />
            </div>
            <div className="lg:col-span-1 space-y-3">
              <h2 className="text-lg font-semibold text-foreground border-b pb-2">Acesso Rápido</h2>
              <QuickAccessWidget canViewAdmissions={canViewAdmissions} />
            </div>
          </div>
        </TabsContent>

        {/* ─── OPERACIONAL ───────────────────────────────────────────────── */}
        <TabsContent value="operacional" className="space-y-6 mt-6">
          {metricsLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-6">
              <FuelMetricsBlock metrics={metrics?.fuel} canSeeFinancials={false} />
              {isRH && (
                <AdmissionMetricsBlock metrics={metrics?.admission} canSeeFinancials={false} />
              )}
            </div>
          )}
        </TabsContent>

        {/* ─── FINANCEIRO (Master apenas) ────────────────────────────────── */}
        {canSeeFinancials && (
          <TabsContent value="financeiro" className="space-y-6 mt-6">
            {metricsLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
              </div>
            ) : (
              <div className="space-y-6">
                <FuelMetricsBlock metrics={metrics?.fuel} canSeeFinancials />
                {isRH && (
                  <AdmissionMetricsBlock metrics={metrics?.admission} canSeeFinancials />
                )}
              </div>
            )}
          </TabsContent>
        )}

        {/* ─── APROVAÇÕES ────────────────────────────────────────────────── */}
        <TabsContent value="aprovacoes" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground border-b pb-2">Minha Fila</h2>
              <MyQueueWidget userId={user.id} />
            </div>
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground border-b pb-2">Pendências Críticas</h2>
              <CriticalPendingWidget canManage={isAdmin} />
            </div>
          </div>
          {isAdmin && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground border-b pb-2">Controle de Fluxos</h2>
              <FlowControlPanel
                navigate={navigate}
                isRH={isRH}
                canSeeFinancials={canSeeFinancials}
              />
            </section>
          )}
        </TabsContent>

        {/* ─── INDICADORES ───────────────────────────────────────────────── */}
        <TabsContent value="indicadores" className="space-y-6 mt-6">
          {metricsLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-6">
              <FuelMetricsBlock metrics={metrics?.fuel} canSeeFinancials={canSeeFinancials} />
              {isRH && (
                <AdmissionMetricsBlock metrics={metrics?.admission} canSeeFinancials={canSeeFinancials} />
              )}
            </div>
          )}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground border-b pb-2">Atividades Recentes</h2>
            <RecentActivityWidget />
          </section>
        </TabsContent>
      </Tabs>

      {/* Voltar ao topo */}
      {showTop && (
        <Button
          variant="secondary"
          size="icon"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-40 rounded-full shadow-lg h-11 w-11"
          aria-label="Voltar ao topo"
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
