import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, ClipboardList, Pencil, FileDown } from 'lucide-react';
import { useCollaboratorEpiHistory, useEpiMovements } from '../hooks/useEpiQueries';
import { useCollaborators } from '@/hooks/useCollaborators';
import { EPI_DELIVERY_STATUS_LABELS, EPI_MOVEMENT_TYPE_LABELS, EPI_REASON_LABELS } from '../types';
import { StatusBadge } from '@/components/StatusBadge';
import { CollaboratorEditDialog } from '../components/CollaboratorEditDialog';
import { maskCPF, maskPhone } from '@/lib/masks';
import jsPDF from 'jspdf';

function MovementsList({ deliveryId }: { deliveryId: string }) {
  const { data: movements, isLoading } = useEpiMovements(deliveryId);
  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin" />;
  if (!movements?.length) return <span className="text-xs text-muted-foreground">Sem movimentações</span>;
  return (
    <div className="space-y-1">
      {movements.map((m: any) => (
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
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const selectedCollab = collaborators?.find((c: any) => c.id === activeId);

  const downloadHistoryPdf = () => {
    if (!selectedCollab || !history?.length) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 20;
    const green: [number, number, number] = [20, 144, 71];

    doc.setFillColor(...green);
    doc.rect(0, 0, pageW, 4, 'F');

    let y = 20;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...green);
    doc.text('Histórico de EPIs — Colaborador', pageW / 2, y, { align: 'center' });

    y += 12;
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Nome:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(selectedCollab.full_name, margin + 20, y);
    y += 6;
    if (selectedCollab.cpf) { doc.setFont('helvetica', 'bold'); doc.text('CPF:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(maskCPF(selectedCollab.cpf), margin + 20, y); y += 6; }
    if (selectedCollab.role_name) { doc.setFont('helvetica', 'bold'); doc.text('Cargo:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(selectedCollab.role_name, margin + 20, y); y += 6; }
    if (selectedCollab.sector?.name) { doc.setFont('helvetica', 'bold'); doc.text('Setor:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(selectedCollab.sector.name, margin + 20, y); y += 6; }

    y += 6;
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y, pageW - 2 * margin, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('EPI', margin + 2, y + 5);
    doc.text('CA', margin + 65, y + 5);
    doc.text('Qtd', margin + 90, y + 5);
    doc.text('Status', margin + 105, y + 5);
    doc.text('Data', margin + 130, y + 5);
    y += 9;

    doc.setFont('helvetica', 'normal');
    history.forEach((d: any) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text((d.epi_item?.name || '—').slice(0, 30), margin + 2, y, { maxWidth: 60 });
      doc.text(d.epi_item?.ca_number || '—', margin + 65, y);
      doc.text(String(d.quantity), margin + 90, y);
      doc.text(EPI_DELIVERY_STATUS_LABELS[d.current_status] || d.current_status, margin + 105, y);
      doc.text(new Date(d.delivered_at).toLocaleDateString('pt-BR'), margin + 130, y);
      y += 6;
    });

    const footerY = doc.internal.pageSize.getHeight() - 10;
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(`SV Engenharia • Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, footerY, { align: 'center' });

    const safeName = selectedCollab.full_name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    doc.save(`Historico_EPI_${safeName}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            // Volta para a página anterior do histórico; se não houver, vai para entregas
            if (window.history.length > 1) navigate(-1);
            else navigate('/epis/deliveries');
          }}
          aria-label="Voltar"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
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
                <SelectContent>{(collaborators || []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.full_name}{c.role_name ? ` — ${c.role_name}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {activeId && selectedCollab && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">{selectedCollab.full_name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedCollab.role_name}{selectedCollab.sector?.name ? ` • ${selectedCollab.sector.name}` : ''}
                  {selectedCollab.cpf ? ` • CPF: ${maskCPF(selectedCollab.cpf)}` : ''}
                </p>
                {selectedCollab.email && <p className="text-xs text-muted-foreground">{selectedCollab.email}</p>}
                {selectedCollab.telefone && <p className="text-xs text-muted-foreground">{maskPhone(selectedCollab.telefone)}</p>}
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setEditDialogOpen(true)}>
                  <Pencil className="w-3 h-3" /> Editar
                </Button>
                {history && history.length > 0 && (
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={downloadHistoryPdf}>
                    <FileDown className="w-3 h-3" /> PDF
                  </Button>
                )}
              </div>
            </div>
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
                {history.map((d: any) => (
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

      <CollaboratorEditDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} collaborator={selectedCollab} />
    </div>
  );
}
