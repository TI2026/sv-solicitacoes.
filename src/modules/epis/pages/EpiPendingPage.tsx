import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Clock, ShieldAlert } from 'lucide-react';
import { useEpiPending } from '../hooks/useEpiQueries';
import { EPI_DELIVERY_STATUS_LABELS } from '../types';
import { StatusBadge } from '@/components/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function EpiPendingPage() {
  const { data: pending, isLoading } = useEpiPending();

  const caExpiring = useMemo(() => {
    if (!pending) return [];
    const now = new Date();
    return pending.filter(d => {
      const caDate = d.epi_item?.ca_valid_until;
      if (!caDate) return false;
      const diff = (new Date(caDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 90;
    });
  }, [pending]);

  const usefulLifeExpired = useMemo(() => {
    if (!pending) return [];
    const now = new Date();
    return pending.filter(d => {
      const days = d.epi_item?.useful_life_days;
      if (!days) return false;
      const deliveredDate = new Date(d.delivered_at);
      const expiresAt = new Date(deliveredDate.getTime() + days * 24 * 60 * 60 * 1000);
      return expiresAt < now;
    });
  }, [pending]);

  const pendingReturn = useMemo(() => (pending || []).filter(d => d.current_status === 'pendente_devolucao'), [pending]);

  // Group by sector
  const bySector = useMemo(() => {
    const map = new Map<string, any[]>();
    (pending || []).forEach(d => {
      const sector = d.collaborator?.sector_id || 'sem_setor';
      if (!map.has(sector)) map.set(sector, []);
      map.get(sector)!.push(d);
    });
    return map;
  }, [pending]);

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><AlertTriangle className="w-6 h-6 text-primary" /> Pendências de EPI</h1>
        <p className="text-sm text-muted-foreground">EPIs em aberto, CAs vencendo e vida útil expirada</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /> Pend. Devolução</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{pendingReturn.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-destructive" /> CA Vencendo</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{caExpiring.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-muted-foreground" /> Vida Útil Expirada</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{usefulLifeExpired.length}</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending_return">
        <TabsList>
          <TabsTrigger value="pending_return">Pend. Devolução ({pendingReturn.length})</TabsTrigger>
          <TabsTrigger value="ca_expiring">CA Vencendo ({caExpiring.length})</TabsTrigger>
          <TabsTrigger value="useful_life">Vida Útil ({usefulLifeExpired.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending_return">
          <Card><CardContent className="pt-6">
            {pendingReturn.length === 0 ? <p className="text-center py-8 text-muted-foreground">Nenhuma pendência de devolução</p> : (
              <table className="w-full text-sm"><thead><tr className="border-b border-border text-left">
                <th className="py-2 px-3 font-medium text-muted-foreground">Colaborador</th>
                <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Matrícula</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">EPI</th>
                <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Entrega</th>
              </tr></thead><tbody>
                {pendingReturn.map(d => (
                  <tr key={d.id} className="border-b last:border-0"><td className="py-2.5 px-3 font-medium">{d.collaborator?.full_name}</td><td className="py-2.5 px-3 hidden md:table-cell text-muted-foreground font-mono text-xs">{d.collaborator?.matricula || '—'}</td><td className="py-2.5 px-3">{d.epi_item?.name}</td><td className="py-2.5 px-3 hidden md:table-cell">{new Date(d.delivered_at).toLocaleDateString('pt-BR')}</td></tr>
                ))}
              </tbody></table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ca_expiring">
          <Card><CardContent className="pt-6">
            {caExpiring.length === 0 ? <p className="text-center py-8 text-muted-foreground">Nenhum CA vencendo nos próximos 90 dias</p> : (
              <table className="w-full text-sm"><thead><tr className="border-b border-border text-left">
                <th className="py-2 px-3 font-medium text-muted-foreground">Colaborador</th>
                <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Matrícula</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">EPI</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">CA</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">Validade</th>
              </tr></thead><tbody>
                {caExpiring.map(d => (
                  <tr key={d.id} className="border-b last:border-0"><td className="py-2.5 px-3 font-medium">{d.collaborator?.full_name}</td><td className="py-2.5 px-3 hidden md:table-cell text-muted-foreground font-mono text-xs">{d.collaborator?.matricula || '—'}</td><td className="py-2.5 px-3">{d.epi_item?.name}</td><td className="py-2.5 px-3">{d.epi_item?.ca_number}</td><td className="py-2.5 px-3 text-destructive font-medium">{d.epi_item?.ca_valid_until ? new Date(d.epi_item.ca_valid_until).toLocaleDateString('pt-BR') : '—'}</td></tr>
                ))}
              </tbody></table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="useful_life">
          <Card><CardContent className="pt-6">
            {usefulLifeExpired.length === 0 ? <p className="text-center py-8 text-muted-foreground">Nenhum item com vida útil expirada</p> : (
              <table className="w-full text-sm"><thead><tr className="border-b border-border text-left">
                <th className="py-2 px-3 font-medium text-muted-foreground">Colaborador</th>
                <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Matrícula</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">EPI</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">Entrega</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">Vida Útil</th>
              </tr></thead><tbody>
                {usefulLifeExpired.map(d => (
                  <tr key={d.id} className="border-b last:border-0"><td className="py-2.5 px-3 font-medium">{d.collaborator?.full_name}</td><td className="py-2.5 px-3 hidden md:table-cell text-muted-foreground font-mono text-xs">{d.collaborator?.matricula || '—'}</td><td className="py-2.5 px-3">{d.epi_item?.name}</td><td className="py-2.5 px-3">{new Date(d.delivered_at).toLocaleDateString('pt-BR')}</td><td className="py-2.5 px-3 text-orange-600">{d.epi_item?.useful_life_days} dias</td></tr>
                ))}
              </tbody></table>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
