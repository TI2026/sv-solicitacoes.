import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Fuel, Clock, CheckCircle, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export function MetricCard({ icon: Icon, label, value, onClick, gradientClass }: any) {
  return (
    <Card 
      className={`relative overflow-hidden group ${onClick ? 'cursor-pointer hover:shadow-md transition-all duration-300 hover:-translate-y-1' : ''}`} 
      onClick={onClick}
    >
      <div className={`absolute top-0 left-0 w-1 h-full ${gradientClass || 'bg-blue-500'}`} />
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500 tracking-tight mb-1">{label}</p>
          <h3 className="text-3xl font-bold text-slate-800 tracking-tight">{value}</h3>
        </div>
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${gradientClass ? gradientClass.replace('bg-', 'bg-opacity-10 text-').replace('to-', '') : 'bg-blue-50 text-blue-600'}`}>
          <Icon className="h-6 w-6 opacity-80" />
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
        <MetricCard icon={Fuel} label="Total" value={metrics.total} gradientClass="bg-blue-500" onClick={() => navigate('/fleet')} />
        <MetricCard icon={Clock} label="Pendentes" value={metrics.pendentes} gradientClass="bg-amber-500" onClick={() => navigate('/fleet')} />
        <MetricCard icon={CheckCircle} label="Aprovados" value={metrics.aprovados} gradientClass="bg-emerald-500" onClick={() => navigate('/fleet')} />
        {canSeeFinancials && (
          <MetricCard icon={DollarSign} label="Valor Total" value={formatCurrency(metrics.valor_total || 0)} gradientClass="bg-purple-500" />
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
      )}
    </div>
  );
}
