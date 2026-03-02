import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/StatusBadge';
import { ADMISSION_STATUS_LABELS, FUEL_STATUS_LABELS } from '@/lib/constants';
import { Loader2, FileText, Fuel, DollarSign, Users, Clock, CheckCircle, XCircle, TrendingUp, BarChart3 } from 'lucide-react';
import { ROLE_LABELS } from '@/types';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

function MetricCard({ icon: Icon, label, value, color, onClick }: {
  icon: any; label: string; value: string | number; color?: string; onClick?: () => void;
}) {
  return (
    <Card className={`cursor-pointer hover:border-primary/30 transition-colors ${onClick ? '' : ''}`} onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
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
  'hsl(145, 63%, 32%)',
  'hsl(38, 92%, 50%)',
  'hsl(210, 80%, 52%)',
  'hsl(0, 72%, 51%)',
  'hsl(280, 60%, 50%)',
  'hsl(170, 60%, 40%)',
];

export default function DashboardPage() {
  const { user, hasRole, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const [drilldown, setDrilldown] = useState<{ type: string; title: string; data: any[] } | null>(null);

  const isAdmin = hasAnyRole(['diretoria', 'administrativo']);
  const isRH = hasAnyRole(['diretoria', 'rh']);

  // Fuel metrics
  const { data: fuelData, isLoading: fuelLoading } = useQuery({
    queryKey: ['fuel_metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_requests')
        .select('id, valor, status, created_at, data_abastecimento');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Admission metrics
  const { data: admData, isLoading: admLoading } = useQuery({
    queryKey: ['admission_metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admission_requests')
        .select('id, status, cargo_funcao, centro_custo, salario_previsto, created_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && isRH,
  });

  if (!user) return null;
  const primaryRole = user.roles[0];

  // Compute fuel metrics
  const fuelTotal = fuelData?.length || 0;
  const fuelPendentes = fuelData?.filter(f => !['aprovado', 'reprovado', 'encerrado'].includes(f.status)).length || 0;
  const fuelAprovados = fuelData?.filter(f => f.status === 'encerrado' || f.status === 'aprovado').length || 0;
  const fuelValorTotal = fuelData?.reduce((sum, f) => sum + Number(f.valor || 0), 0) || 0;
  const fuelByStatus = Object.entries(
    (fuelData || []).reduce((acc, f) => { acc[f.status] = (acc[f.status] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([status, count]) => ({ name: FUEL_STATUS_LABELS[status] || status, value: count }));

  // Compute admission metrics
  const admTotal = admData?.length || 0;
  const admPendentes = admData?.filter(a => !['concluido', 'cancelado'].includes(a.status)).length || 0;
  const admConcluidos = admData?.filter(a => a.status === 'concluido').length || 0;
  const admSalarioTotal = admData?.reduce((sum, a) => sum + Number(a.salario_previsto || 0), 0) || 0;
  const admByStatus = Object.entries(
    (admData || []).reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([status, count]) => ({ name: ADMISSION_STATUS_LABELS[status] || status, value: count }));

  const openDrilldown = (type: string, title: string, data: any[]) => {
    setDrilldown({ type, title, data });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Olá, {user.full_name || 'Usuário'}!</h1>
        <p className="text-muted-foreground mt-1">
          {primaryRole ? ROLE_LABELS[primaryRole] : 'Sem papel'}
          {user.department && <> · {user.department}</>}
        </p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          {isRH && <TabsTrigger value="admissions">Admissões</TabsTrigger>}
          <TabsTrigger value="fleet">Abastecimento</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard icon={Fuel} label="Solicitações Frota" value={fuelTotal} onClick={() => navigate('/fleet')} />
            <MetricCard icon={Clock} label="Pendentes Frota" value={fuelPendentes} onClick={() => openDrilldown('fuel_pending', 'Frota Pendentes', fuelData?.filter(f => !['aprovado', 'reprovado', 'encerrado'].includes(f.status)) || [])} />
            {isRH && <MetricCard icon={Users} label="Admissões" value={admTotal} onClick={() => navigate('/admissions')} />}
            {isRH && <MetricCard icon={Clock} label="Admissões Pendentes" value={admPendentes} />}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard icon={DollarSign} label="Valor Total Frota" value={`R$ ${fuelValorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
            <MetricCard icon={CheckCircle} label="Frota Aprovados" value={fuelAprovados} />
            {isRH && <MetricCard icon={CheckCircle} label="Admissões Concluídas" value={admConcluidos} />}
            {isRH && <MetricCard icon={DollarSign} label="Salário Total Previsto" value={`R$ ${admSalarioTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />}
          </div>
        </TabsContent>

        {/* Admissions Tab */}
        {isRH && (
          <TabsContent value="admissions" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard icon={Users} label="Total" value={admTotal} onClick={() => navigate('/admissions')} />
              <MetricCard icon={Clock} label="Pendentes" value={admPendentes} />
              <MetricCard icon={CheckCircle} label="Concluídos" value={admConcluidos} />
              <MetricCard icon={DollarSign} label="Salário Total" value={`R$ ${admSalarioTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
            </div>
            {admByStatus.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Por Status</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={admByStatus}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        {/* Fleet Tab */}
        <TabsContent value="fleet" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard icon={Fuel} label="Total" value={fuelTotal} onClick={() => navigate('/fleet')} />
            <MetricCard icon={Clock} label="Pendentes" value={fuelPendentes} />
            <MetricCard icon={CheckCircle} label="Aprovados" value={fuelAprovados} />
            <MetricCard icon={DollarSign} label="Valor Total" value={`R$ ${fuelValorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
          </div>
          {fuelByStatus.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Por Status</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={fuelByStatus}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-4">Distribuição</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={fuelByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                          {fuelByStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Drilldown Dialog */}
      <Dialog open={!!drilldown} onOpenChange={() => setDrilldown(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{drilldown?.title}</DialogTitle>
          </DialogHeader>
          {drilldown?.data && drilldown.data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum item</p>
          ) : (
            <div className="space-y-2">
              {drilldown?.data.map((item: any) => (
                <Card key={item.id} className="cursor-pointer hover:border-primary/30" onClick={() => { setDrilldown(null); navigate(`/fleet/${item.id}`); }}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">R$ {Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <StatusBadge status={item.status} label={FUEL_STATUS_LABELS[item.status] || item.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(item.created_at).toLocaleDateString('pt-BR')}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
