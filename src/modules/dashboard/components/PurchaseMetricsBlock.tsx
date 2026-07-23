/**
 * PurchaseMetricsBlock
 *
 * B5 Fix Sprint 15: bloco de métricas de Compras reativado.
 * Estava desabilitado desde Sprint 13.9 com o comentário:
 *   "tabela `purchases` inexistente".
 * A tabela agora está ativa (Sprint 8 / 14) e os dados de purchase
 * já são retornados por get_dashboard_metrics().
 *
 * Fonte: get_dashboard_metrics() → campo 'purchase'.
 */
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, CheckCircle, Clock, DollarSign } from 'lucide-react';
import { MetricCard } from './FuelMetricsBlock';

interface PurchaseMetrics {
  total?: number;
  abertas?: number;
  aprovadas?: number;
  valor_total?: number;
}

interface PurchaseMetricsBlockProps {
  metrics?: PurchaseMetrics | null;
  canSeeFinancials?: boolean;
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export function PurchaseMetricsBlock({ metrics, canSeeFinancials = false }: PurchaseMetricsBlockProps) {
  const navigate = useNavigate();

  if (!metrics) return null;

  return (
    <section>
      <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-primary" />
        Compras
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={ShoppingCart}
          label="Total de Compras"
          value={metrics.total ?? 0}
          onClick={() => navigate('/purchases')}
          gradientClass="bg-gradient-to-b from-primary to-primary/70"
        />
        <MetricCard
          icon={Clock}
          label="Em Andamento"
          value={metrics.abertas ?? 0}
          onClick={() => navigate('/purchases')}
          gradientClass="bg-gradient-to-b from-amber-500 to-amber-400"
        />
        <MetricCard
          icon={CheckCircle}
          label="Aprovadas"
          value={metrics.aprovadas ?? 0}
          gradientClass="bg-gradient-to-b from-emerald-500 to-emerald-400"
        />
        {canSeeFinancials && (
          <MetricCard
            icon={DollarSign}
            label="Valor Total"
            value={formatCurrency(metrics.valor_total ?? 0)}
            gradientClass="bg-gradient-to-b from-blue-500 to-blue-400"
          />
        )}
      </div>
    </section>
  );
}
