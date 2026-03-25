import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, ClipboardList, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useCollaborators, useCollaboratorEpiHistory, useEpiMovements } from '../hooks/useEpiQueries';
import { EPI_DELIVERY_STATUS_LABELS, EPI_MOVEMENT_TYPE_LABELS } from '../types';
import { StatusBadge } from '@/components/StatusBadge';

function MovementsList({ deliveryId }: { deliveryId: string }) {
  const { data: movements, isLoading } = useEpiMovements(deliveryId);
  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin" />;
  if (!movements?.length) return <span className="text-xs text-muted-foreground">Sem movimentações</span>;
  return (
    <div className="space-y-1">
      {movements.map(m => (
        <div key={m.id} className="text-xs flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{EPI_MOVEMENT_TYPE_LABELS[m.movement_type] || m.movement_type}</Badge>
          <span className="text-muted-foreground">{new Date(m.moved_at).toLocaleDateString('pt-BR')}</span>
          <span className="text-muted-foreground">{m.moved_by?.full_name}</span>
          {m.condition && <span className="text-muted-foreground">({m.condition})</span>}
        </div>
      ))}
    </div>
  );
}

export default function EpiHistoryPage() {
  const { collaboratorId } = useParams<{ collaboratorId: string }>();
  const navigate = useNavigate();
  const { data: collaborators } = useCollaborators({ active: true });
  const [selectedId, setSelectedId] = useState(collaboratorId || '');
  const activeId = selectedId || collaboratorId;
  const { data: history, isLoading } = useCollaboratorEpiHistory(activeId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const selectedCollab = collaborators?.find(c => c.id === activeId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/epis/deliveries')}><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><ClipboardList className="w-6 h-6 text-primary" /> Histórico de EPI</h1>
          <p className="text-sm text-muted-foreground">Entregas, devoluções e movimentações por colaborador</p>
        </div>
      </div>

      {!collaboratorId && (
        <Card>
          <CardContent className="pt-6">
            <div className="max-w-md space-y-1.5">
              <label className="text-xs font-medium">Selecione o Colaborador</label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger><SelectValue placeholder="Escolha um colaborador" /></SelectTrigger>
                <SelectContent>{(collaborators || []).map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}{c.role_name ? ` — ${c.role_name}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {activeId && selectedCollab && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{selectedCollab.full_name}</CardTitle>
            <p className="text-xs text-muted-foreground">{selectedCollab.role_name}{selectedCollab.sector?.name ? ` • ${selectedCollab.sector.name}` : ''}</p>
          </CardHeader>
        </Card>
      )}

      {activeId && (
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : !history?.length ? (
              <p className="text-center py-12 text-muted-foreground">Nenhum registro de EPI encontrado</p>
            ) : (
              <div className="space-y-3">
                {history.map(d => (
                  <div key={d.id} className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{d.epi_item?.name || '—'}</span>
                          <span className="text-xs font-mono text-muted-foreground">{d.epi_item?.code}</span>
                          {d.size && <Badge variant="outline" className="text-[10px]">{d.size}</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>Qtd: {d.quantity}</span>
                          <span>CA: {d.epi_item?.ca_number || '—'}</span>
                          <span>Entregue em {new Date(d.delivered_at).toLocaleDateString('pt-BR')}</span>
                          <span>por {d.delivered_by?.full_name}</span>
                        </div>
                      </div>
                      <StatusBadge status={d.current_status} label={EPI_DELIVERY_STATUS_LABELS[d.current_status] || d.current_status} />
                    </div>
                    <div className="mt-2">
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                        {expandedId === d.id ? 'Ocultar movimentações' : 'Ver movimentações'}
                      </Button>
                      {expandedId === d.id && <div className="mt-2 pl-2 border-l-2 border-primary/20"><MovementsList deliveryId={d.id} /></div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
