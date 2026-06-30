import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Fuel, Clock, CheckCircle, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export function MetricCard({ icon: Icon, label, value, onClick }: any) {
  return (
    <Card className={onClick ? 'cursor-pointer hover:bg-slate-50 transition-colors' : ''} onClick={onClick}>
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
          <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        </div>
        <div className="h-12 w-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  );
}

export function FuelMetricsBlock({ metrics, canSeeFinancials }: { metrics: any; canSeeFinancials: boolean }) {
  const navigate = useNavigate();

  if (!metrics) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard icon={Fuel} label="Total" value={metrics.total} onClick={() => navigate('/fleet')} />
        <MetricCard icon={Clock} label="Pendentes" value={metrics.pendentes} onClick={() => navigate('/fleet')} />
        <MetricCard icon={CheckCircle} label="Aprovados" value={metrics.aprovados} onClick={() => navigate('/fleet')} />
        {canSeeFinancials && (
          <MetricCard icon={DollarSign} label="Valor Total" value={formatCurrency(metrics.valor_total || 0)} />
        )}
      </div>

      {canSeeFinancials && (metrics.by_type?.length > 0 || metrics.by_status?.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {metrics.by_type?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Gastos por Categoria</CardTitle></CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.by_type}>
                    <XAxis dataKey="type" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {metrics.by_status?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Status das Solicitações</CardTitle></CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={metrics.by_status} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} label={({ status, count }) => `${status}: ${count}`}>
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
      )}
    </div>
  );
}
