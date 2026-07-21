import { useQuery } from '@tanstack/react-query';
import { ExportReportDialog } from '@/components/ExportReportDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePresence } from '@/contexts/PresenceContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Loader2, ListChecks, ShieldAlert, Download, AlertTriangle } from 'lucide-react';
import { ROLE_LABELS } from '@/types';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

// Widgets da Central Operacional (Sprint 7)
import { MyQueueWidget } from '@/modules/dashboard/components/MyQueueWidget';
import { CriticalPendingWidget } from '@/modules/dashboard/components/CriticalPendingWidget';
import { MyRequestsWidget } from '@/modules/dashboard/components/MyRequestsWidget';
import { RecentActivityWidget } from '@/modules/dashboard/components/RecentActivityWidget';
import { QuickAccessWidget } from '@/modules/dashboard/components/QuickAccessWidget';

import { FuelMetricsBlock } from '@/modules/dashboard/components/FuelMetricsBlock';
import { AdmissionMetricsBlock } from '@/modules/dashboard/components/AdmissionMetricsBlock';
import { PurchaseMetricsBlock } from '@/modules/dashboard/components/PurchaseMetricsBlock';
import { FlowControlPanel } from '@/modules/dashboard/components/FlowControlPanel';

export default function DashboardPage() {
  const { user, hasAnyRole, isMaster } = useAuth();
  const navigate = useNavigate();
  const { onlineUsers } = usePresence();
  const [exportOpen, setExportOpen] = useState(false);

  // Permissões derivadas do perfil
  const isRH = hasAnyRole(['diretoria', 'rh']);
  const isAdmin = hasAnyRole(['diretoria', 'administrativo']);
  const canManage = hasAnyRole(['diretoria', 'administrativo', 'supervisor']);
  const canSeeFinancials = !!isMaster;
  const canViewAdmissions = hasAnyRole(['diretoria', 'rh', 'administrativo']);
  // Aprovador = qualquer papel que não seja somente colaborador
  const isApprovalUser = !!user && user.roles.some(r => r !== 'colaborador');

  // ─── Realtime — invalida todos os widgets reativos ────────────────────────
  useRealtimeSubscription({
    channelName: `dashboard-realtime-${user?.id}`,
    enabled: !!user,
    tables: [
      // Métricas globais
      { table: 'fuel_requests',          queryKeys: [['dashboard_metrics'], ['my_requests', user?.id]] },
      { table: 'admission_requests',     queryKeys: [['dashboard_metrics'], ['my_requests', user?.id]] },
      { table: 'purchases',              queryKeys: [['dashboard_metrics'], ['my_requests', user?.id]] },
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

  const metrics = metricsObj || { fuel: null, admission: null, purchase: null, isError: false };

  if (!user) return <div className="flex h-64 items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const primaryRole = user.roles[0];

  return (
    <div className="space-y-6 animate-fade-in">

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
          BLOCOS DA CENTRAL OPERACIONAL — Ordem conforme RC2.1:
          1. Visão Geral (RecentActivityWidget)
          2. Minhas Solicitações (MyRequestsWidget)
          3. Minha Fila (MyQueueWidget)
          4. Indicadores (Cockpit de Indicadores)
          5. Atalhos (QuickAccessWidget)
          6. Pendências (CriticalPendingWidget)
      ══════════════════════════════════════════════════════════════════════ */}

      {/* 1. Visão Geral */}
      <RecentActivityWidget />

      {/* 2. Minhas Solicitações */}
      <MyRequestsWidget userId={user.id} />

      {/* 3. Minha Fila */}
      {isApprovalUser && <MyQueueWidget userId={user.id} />}

      {/* 4. Indicadores */}
      <div className="space-y-6 mt-8">
        <h2 className="text-lg font-semibold text-foreground border-b pb-2">Visão Operacional</h2>
        
        {metricsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-6">
            <FuelMetricsBlock metrics={metrics?.fuel} canSeeFinancials={canSeeFinancials} />
            <PurchaseMetricsBlock metrics={metrics?.purchase} canSeeFinancials={canSeeFinancials} />
            
            {isRH && (
              <AdmissionMetricsBlock metrics={metrics?.admission} canSeeFinancials={canSeeFinancials} />
            )}
          </div>
        )}

        {isAdmin && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-foreground border-b pb-2 mb-4">Gestão de Fluxos</h2>
            <FlowControlPanel
              navigate={navigate}
              isRH={isRH}
              canSeeFinancials={canSeeFinancials}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* 5. Atalhos */}
        <div>
          <QuickAccessWidget canViewAdmissions={canViewAdmissions} />
        </div>

        {/* 6. Pendências */}
        <div>
          <CriticalPendingWidget canManage={canManage} />
        </div>
      </div>
    </div>
  );
}
