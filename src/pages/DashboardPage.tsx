import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/StatusBadge';
import { ADMISSION_STATUS_LABELS, FUEL_STATUS_LABELS, REQUEST_TYPE_LABELS } from '@/lib/constants';
import { Loader2, Fuel, DollarSign, Users, Clock, CheckCircle, BarChart3, ListChecks, Receipt, Briefcase, ShieldAlert, Wifi } from 'lucide-react';
import { ROLE_LABELS } from '@/types';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

// Check if user has master role via user_role_assignments
function useIsMaster() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['is_master_check', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data } = await supabase
        .from('user_role_assignments')
        .select('role_id, roles(is_master)')
        .eq('user_id', user.id);
      return (data || []).some((a: any) => a.roles?.is_master);
    },
    enabled: !!user?.id,
  });
}

function MetricCard({ icon: Icon, label, value, onClick, accent }: {
  icon: any; label: string; value: string | number; onClick?: () => void; accent?: string;
}) {
  return (
    <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${accent || 'bg-primary/10'}`}>
            <Icon className={`w-5 h-5 ${accent ? 'text-primary-foreground' : 'text-primary'}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-xl font-bold text-foreground">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const CHART_COLORS = [
  'hsl(145, 63%, 32%)', 'hsl(38, 92%, 50%)', 'hsl(210, 80%, 52%)',
  'hsl(0, 72%, 51%)', 'hsl(280, 60%, 50%)', 'hsl(170, 60%, 40%)',
];

interface DrilldownState {
  title: string;
  data: any[];
  type: 'fuel' | 'admission';
  summary?: string;
}

export default function DashboardPage() {
  const { user, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const { data: isMaster } = useIsMaster();
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);

  const isRH = hasAnyRole(['diretoria', 'rh']);
  const isAdmin = hasAnyRole(['diretoria', 'administrativo']);
  // Only master users can see financial values
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
      }));
      // Deduplicate by user_id
      const unique = Array.from(new Map(users.map(u => [u.user_id, u])).values());
      setOnlineUsers(unique);
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isMaster, user]);

  useRealtimeSubscription({
    channelName: 'dashboard-realtime',
    enabled: !!user,
    tables: [
      { table: 'fuel_requests', queryKeys: [['fuel_metrics'], ['fuel_all']] },
      { table: 'admission_requests', queryKeys: [['admission_metrics'], ['adm_all']] },
    ],
  });

  const { data: fuelData, isLoading: fuelLoading } = useQuery({
    queryKey: ['fuel_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_requests')
        .select('id, valor, status, created_at, data_abastecimento, type, daily_value, person_name, placa, categoria, profiles(full_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: admData, isLoading: admLoading } = useQuery({
    queryKey: ['adm_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admission_requests')
        .select('id, status, cargo_funcao, centro_custo, salario_previsto, created_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && isRH,
  });

  const fuelMetrics = useMemo(() => {
    const d = fuelData || [];
    const total = d.length;
    const pendentes = d.filter(f => !['aprovado', 'reprovado', 'encerrado', 'concluido'].includes(f.status)).length;
    const aprovados = d.filter(f => ['encerrado', 'aprovado', 'concluido'].includes(f.status)).length;
    const valorTotal = d.reduce((sum, f) => sum + Number(f.valor || 0), 0);
    const byStatus = Object.entries(
      d.reduce((acc, f) => { acc[f.status] = (acc[f.status] || 0) + 1; return acc; }, {} as Record<string, number>)
    ).map(([status, count]) => ({ name: FUEL_STATUS_LABELS[status] || status, value: count, status }));
    const byType = Object.entries(
      d.reduce((acc, f) => {
        const t = (f as any).type || 'abastecimento';
        const label = REQUEST_TYPE_LABELS[t] || t;
        acc[label] = (acc[label] || 0) + Number(f.valor || 0);
        return acc;
      }, {} as Record<string, number>)
    ).map(([name, value]) => ({ name, value }));
    return {
      total, pendentes, aprovados, valorTotal, byStatus, byType,
      pendentesData: d.filter(f => !['aprovado', 'reprovado', 'encerrado', 'concluido'].includes(f.status)),
      aprovadosData: d.filter(f => ['encerrado', 'aprovado', 'concluido'].includes(f.status)),
      allData: d,
    };
  }, [fuelData]);

  const admMetrics = useMemo(() => {
    const d = admData || [];
    const total = d.length;
    const pendentes = d.filter(a => !['concluido', 'cancelado'].includes(a.status)).length;
    const concluidos = d.filter(a => a.status === 'concluido').length;
    const salarioTotal = d.reduce((sum, a) => sum + Number(a.salario_previsto || 0), 0);
    const byStatus = Object.entries(
      d.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {} as Record<string, number>)
    ).map(([status, count]) => ({ name: ADMISSION_STATUS_LABELS[status] || status, value: count, status }));
    return {
      total, pendentes, concluidos, salarioTotal, byStatus,
      pendentesData: d.filter(a => !['concluido', 'cancelado'].includes(a.status)),
      concluidosData: d.filter(a => a.status === 'concluido'),
    };
  }, [admData]);

  const openDrilldown = useCallback((dd: DrilldownState) => setDrilldown(dd), []);
  const closeDrilldown = useCallback(() => setDrilldown(null), []);

  const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  const maskedCurrency = () => '••••••';

  if (!user) return null;
  const primaryRole = user.roles[0];

  const DrilldownContent = () => {
    if (!drilldown) return null;
    const items = drilldown.data;
    return (
      <div className="space-y-3">
        {drilldown.summary && (
          <div className="p-3 rounded-lg bg-primary/5 text-sm font-medium text-foreground">{drilldown.summary}</div>
        )}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum item</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {items.slice(0, 50).map((item: any) => (
              <Card key={item.id} className="cursor-pointer hover:border-primary/30" onClick={() => {
                closeDrilldown();
                navigate(drilldown.type === 'fuel' ? `/fleet/${item.id}` : `/admissions/${item.id}`);
              }}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {drilldown.type === 'fuel'
                        ? (canSeeFinancials ? formatCurrency(Number(item.valor || 0)) : maskedCurrency())
                        : (item.cargo_funcao || 'Admissão')}
                    </span>
                    <StatusBadge
                      status={item.status}
                      label={(drilldown.type === 'fuel' ? FUEL_STATUS_LABELS : ADMISSION_STATUS_LABELS)[item.status] || item.status}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(item.created_at).toLocaleDateString('pt-BR')}
                    {(item as any).type && ` · ${REQUEST_TYPE_LABELS[(item as any).type] || (item as any).type}`}
                  </p>
                </CardContent>
              </Card>
            ))}
            {items.length > 50 && <p className="text-xs text-muted-foreground text-center">Mostrando 50 de {items.length}</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Olá, {user.full_name || 'Usuário'}!</h1>
        <p className="text-muted-foreground mt-1">
          {primaryRole ? ROLE_LABELS[primaryRole] : 'Sem papel'}
          {user.department && <> · {user.department}</>}
          {isMaster && <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-800"><ShieldAlert className="w-3 h-3" />Master</span>}
        </p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full sm:w-auto flex-wrap">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="concluidos">Concluídos</TabsTrigger>
          {isRH && <TabsTrigger value="admissions">Admissões</TabsTrigger>}
          <TabsTrigger value="fleet">Solicitações</TabsTrigger>
          {isAdmin && <TabsTrigger value="fluxos" className="gap-1"><ListChecks className="w-3.5 h-3.5" /> Fluxos</TabsTrigger>}
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {fuelLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricCard icon={Fuel} label="Solicitações" value={fuelMetrics.total} onClick={() => navigate('/fleet')} />
                <MetricCard icon={Clock} label="Pendentes Frota" value={fuelMetrics.pendentes}
                  onClick={() => openDrilldown({ title: 'Frota Pendentes', data: fuelMetrics.pendentesData, type: 'fuel', summary: `${fuelMetrics.pendentes} solicitações pendentes` })} />
                {isRH && <MetricCard icon={Users} label="Admissões Pendentes" value={admMetrics.pendentes}
                  onClick={() => openDrilldown({ title: 'Admissões Pendentes', data: admMetrics.pendentesData, type: 'admission', summary: `${admMetrics.pendentes} admissões pendentes` })} />}
                {isRH && <MetricCard icon={CheckCircle} label="Admissões Concluídas" value={admMetrics.concluidos}
                  onClick={() => openDrilldown({ title: 'Admissões Concluídas', data: admMetrics.concluidosData, type: 'admission', summary: `${admMetrics.concluidos} concluídas` })} />}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {canSeeFinancials ? (
                  <MetricCard icon={DollarSign} label="Valor Total Frota" value={formatCurrency(fuelMetrics.valorTotal)}
                    onClick={() => openDrilldown({ title: 'Valor Total Frota', data: fuelMetrics.allData, type: 'fuel', summary: `Total: ${formatCurrency(fuelMetrics.valorTotal)}` })} />
                ) : (
                  <MetricCard icon={DollarSign} label="Valor Total Frota" value="••••••" />
                )}
                <MetricCard icon={CheckCircle} label="Frota Aprovados" value={fuelMetrics.aprovados}
                  onClick={() => openDrilldown({ title: 'Frota Aprovados', data: fuelMetrics.aprovadosData, type: 'fuel', summary: `${fuelMetrics.aprovados} aprovados/concluídos` })} />
                {isRH && canSeeFinancials && <MetricCard icon={DollarSign} label="Salário Total Previsto" value={formatCurrency(admMetrics.salarioTotal)}
                  onClick={() => openDrilldown({ title: 'Salário Total Previsto', data: admMetrics.pendentesData, type: 'admission', summary: `Total previsto: ${formatCurrency(admMetrics.salarioTotal)}` })} />}
                {isRH && !canSeeFinancials && <MetricCard icon={DollarSign} label="Salário Total Previsto" value="••••••" />}
                {isRH && <MetricCard icon={Users} label="Total Admissões" value={admMetrics.total} onClick={() => navigate('/admissions')} />}
              </div>
            </>
          )}
        </TabsContent>

        {/* CONCLUÍDOS TAB */}
        <TabsContent value="concluidos" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Fuel className="w-4 h-4" /> Abastecimentos Concluídos
                </h3>
                {(() => {
                  const completed = (fuelData || []).filter((f: any) => ['concluido', 'encerrado'].includes(f.status) && f.type === 'abastecimento');
                  if (completed.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">Nenhum</p>;
                  return (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {completed.slice(0, 20).map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between text-sm border border-border rounded-lg p-2 cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/fleet/${item.id}`)}>
                          <div>
                            <span className="font-medium">{canSeeFinancials ? formatCurrency(Number(item.valor || 0)) : '••••••'}</span>
                            {item.placa && <span className="text-xs text-muted-foreground ml-2">🚗 {item.placa}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                            <StatusBadge status={item.status} label={FUEL_STATUS_LABELS[item.status] || item.status} />
                          </div>
                        </div>
                      ))}
                      {completed.length > 20 && <p className="text-xs text-muted-foreground text-center">+{completed.length - 20} mais</p>}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Receipt className="w-4 h-4" /> Reembolsos Concluídos
                </h3>
                {(() => {
                  const completed = (fuelData || []).filter((f: any) => ['concluido', 'encerrado'].includes(f.status) && f.type === 'reembolso');
                  if (completed.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">Nenhum</p>;
                  return (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {completed.slice(0, 20).map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between text-sm border border-border rounded-lg p-2 cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/fleet/${item.id}`)}>
                          <div>
                            <span className="font-medium">{canSeeFinancials ? formatCurrency(Number(item.valor || 0)) : '••••••'}</span>
                            {item.categoria && <span className="text-xs text-muted-foreground ml-2">{item.categoria}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                            <StatusBadge status={item.status} label={FUEL_STATUS_LABELS[item.status] || item.status} />
                          </div>
                        </div>
                      ))}
                      {completed.length > 20 && <p className="text-xs text-muted-foreground text-center">+{completed.length - 20} mais</p>}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {isRH && (
          <TabsContent value="admissions" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard icon={Users} label="Total" value={admMetrics.total} onClick={() => navigate('/admissions')} />
              <MetricCard icon={Clock} label="Pendentes" value={admMetrics.pendentes}
                onClick={() => openDrilldown({ title: 'Admissões Pendentes', data: admMetrics.pendentesData, type: 'admission' })} />
              <MetricCard icon={CheckCircle} label="Concluídos" value={admMetrics.concluidos}
                onClick={() => openDrilldown({ title: 'Admissões Concluídas', data: admMetrics.concluidosData, type: 'admission' })} />
              {canSeeFinancials ? (
                <MetricCard icon={DollarSign} label="Salário Total" value={formatCurrency(admMetrics.salarioTotal)}
                  onClick={() => openDrilldown({ title: 'Salário Total Previsto', data: admMetrics.pendentesData, type: 'admission', summary: formatCurrency(admMetrics.salarioTotal) })} />
              ) : (
                <MetricCard icon={DollarSign} label="Salário Total" value="••••••" />
              )}
            </div>
            {admMetrics.byStatus.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Distribuição por Status</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={admMetrics.byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                          {admMetrics.byStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        {/* FLEET/SOLICITAÇÕES TAB */}
        <TabsContent value="fleet" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard icon={Fuel} label="Total" value={fuelMetrics.total} onClick={() => navigate('/fleet')} />
            <MetricCard icon={Clock} label="Pendentes" value={fuelMetrics.pendentes}
              onClick={() => openDrilldown({ title: 'Pendentes', data: fuelMetrics.pendentesData, type: 'fuel' })} />
            <MetricCard icon={CheckCircle} label="Aprovados" value={fuelMetrics.aprovados}
              onClick={() => openDrilldown({ title: 'Aprovados', data: fuelMetrics.aprovadosData, type: 'fuel' })} />
            {canSeeFinancials ? (
              <MetricCard icon={DollarSign} label="Valor Total" value={formatCurrency(fuelMetrics.valorTotal)}
                onClick={() => openDrilldown({ title: 'Valor Total', data: fuelMetrics.allData, type: 'fuel', summary: formatCurrency(fuelMetrics.valorTotal) })} />
            ) : (
              <MetricCard icon={DollarSign} label="Valor Total" value="••••••" />
            )}
          </div>
          {canSeeFinancials && (fuelMetrics.byType.length > 0 || fuelMetrics.byStatus.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {fuelMetrics.byType.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Valor por Tipo</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={fuelMetrics.byType}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v: number) => formatCurrency(v)} />
                          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
              {fuelMetrics.byStatus.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold mb-4">Distribuição por Status</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={fuelMetrics.byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                            {fuelMetrics.byStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* CONTROLE DE FLUXOS TAB */}
        {isAdmin && (
          <TabsContent value="fluxos" className="space-y-4 mt-4">
            <FlowControlPanel fuelData={fuelData || []} admData={admData || []} navigate={navigate} isRH={isRH} canSeeFinancials={canSeeFinancials} />
          </TabsContent>
        )}
      </Tabs>

      {/* Drilldown */}
      {isMobile ? (
        <Drawer open={!!drilldown} onOpenChange={() => closeDrilldown()}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader><DrawerTitle>{drilldown?.title}</DrawerTitle></DrawerHeader>
            <div className="px-4 pb-4"><DrilldownContent /></div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={!!drilldown} onOpenChange={() => closeDrilldown()}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{drilldown?.title}</DialogTitle></DialogHeader>
            <DrilldownContent />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ========== Controle de Fluxos sub-component ========== */
function FlowControlPanel({ fuelData, admData, navigate, isRH, canSeeFinancials }: {
  fuelData: any[]; admData: any[]; navigate: (p: string) => void; isRH: boolean; canSeeFinancials: boolean;
}) {
  const [tab, setTab] = useState(isRH ? 'admissions' : 'fuel');

  const fuelByStatus = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const f of fuelData) {
      if (['concluido', 'encerrado', 'reprovado'].includes(f.status)) continue;
      const key = f.status;
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [fuelData]);

  const admByStatus = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const a of admData) {
      if (['concluido', 'cancelado'].includes(a.status)) continue;
      const key = a.status;
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [admData]);

  const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <ListChecks className="w-5 h-5" /> Controle de Fluxos
      </h2>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto">
          {isRH && <TabsTrigger value="admissions">Admissões</TabsTrigger>}
          <TabsTrigger value="fuel">Solicitações</TabsTrigger>
          <TabsTrigger value="pendencias">Pendências</TabsTrigger>
        </TabsList>

        {isRH && (
          <TabsContent value="admissions" className="mt-3 space-y-3">
            {admByStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma admissão pendente</p>
            ) : admByStatus.map(([status, items]) => (
              <Card key={status}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <StatusBadge status={status} label={ADMISSION_STATUS_LABELS[status] || status} />
                    <span className="text-xs font-semibold text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="space-y-1">
                    {items.slice(0, 5).map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1" onClick={() => navigate(`/admissions/${item.id}`)}>
                        <span className="truncate">{item.cargo_funcao || 'Admissão'}</span>
                        <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                    ))}
                    {items.length > 5 && <p className="text-xs text-muted-foreground text-center">+{items.length - 5} mais</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        )}

        <TabsContent value="fuel" className="mt-3 space-y-3">
          {fuelByStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma solicitação pendente</p>
          ) : fuelByStatus.map(([status, items]) => (
            <Card key={status}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <StatusBadge status={status} label={FUEL_STATUS_LABELS[status] || status} />
                  <span className="text-xs font-semibold text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-1">
                  {items.slice(0, 5).map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1" onClick={() => navigate(`/fleet/${item.id}`)}>
                      <span className="truncate">
                        {canSeeFinancials ? formatCurrency(Number(item.valor || 0)) : '••••••'}
                        {item.type && ` · ${REQUEST_TYPE_LABELS[item.type] || item.type}`}
                      </span>
                      <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  ))}
                  {items.length > 5 && <p className="text-xs text-muted-foreground text-center">+{items.length - 5} mais</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="pendencias" className="mt-3">
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm text-foreground font-medium">Itens aguardando sua ação:</p>
              {[
                ...fuelData.filter(f => f.status === 'enviado').map(f => ({ ...f, _action: 'Encaminhar para Aprovação', _path: `/fleet/${f.id}` })),
                ...fuelData.filter(f => f.status === 'em_aprovacao').map(f => ({ ...f, _action: 'Aprovar/Reprovar', _path: `/fleet/${f.id}` })),
                ...fuelData.filter(f => f.status === 'em_revisao_admin').map(f => ({ ...f, _action: 'Revisar Anexos', _path: `/fleet/${f.id}` })),
              ].slice(0, 10).map((item: any) => (
                <div key={item.id} className="flex items-center justify-between text-sm border border-border rounded-lg p-2 cursor-pointer hover:bg-muted/50" onClick={() => navigate(item._path)}>
                  <div>
                    <span className="font-medium">{canSeeFinancials ? formatCurrency(Number(item.valor || 0)) : '••••••'}</span>
                    <span className="text-xs text-muted-foreground ml-2">{item._action}</span>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs">Abrir</Button>
                </div>
              ))}
              {fuelData.filter(f => ['enviado', 'em_aprovacao', 'em_revisao_admin'].includes(f.status)).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma pendência</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
