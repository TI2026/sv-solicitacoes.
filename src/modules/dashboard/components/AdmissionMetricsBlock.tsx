import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, FileCheck, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';
import { MetricCard } from './FuelMetricsBlock'; // Reusing MetricCard

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export function AdmissionMetricsBlock({ metrics, canSeeFinancials }: { metrics: any; canSeeFinancials: boolean }) {
  const navigate = useNavigate();

  if (!metrics) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard icon={Users} label="Total Solicitadas" value={metrics.total} gradientClass="bg-indigo-500" onClick={() => navigate('/admissions')} />
        <MetricCard icon={UserPlus} label="Em Andamento" value={metrics.em_andamento} gradientClass="bg-cyan-500" onClick={() => navigate('/admissions')} />
        <MetricCard icon={FileCheck} label="Aguardando Registros" value={metrics.aguardando_registros} gradientClass="bg-rose-500" onClick={() => navigate('/admissions')} />
        {canSeeFinancials && (
          <MetricCard icon={DollarSign} label="Custo Ativo (Salários)" value={formatCurrency(metrics.active_cost || 0)} gradientClass="bg-fuchsia-500" />
        )}
      </div>

      {metrics.by_status?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Admissões por Status</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={metrics.by_status} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} label={(props: any) => `${props.status ?? props.payload?.status}: ${props.count ?? props.payload?.count}`}>
                  {metrics.by_status.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
