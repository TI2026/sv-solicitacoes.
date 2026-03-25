import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileText, Download } from 'lucide-react';
import { useCollaborators, useCollaboratorEpiHistory } from '../hooks/useEpiQueries';
import { EPI_DELIVERY_STATUS_LABELS } from '../types';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';

export default function EpiDismissalReportPage() {
  const [selectedId, setSelectedId] = useState('');
  const { data: collaborators } = useCollaborators();
  const { data: history, isLoading } = useCollaboratorEpiHistory(selectedId || undefined);
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);

  const selectedCollab = collaborators?.find(c => c.id === selectedId);

  const devolvidos = (history || []).filter(d => d.current_status === 'devolvido');
  const pendentes = (history || []).filter(d => ['entregue', 'em_uso', 'pendente_devolucao'].includes(d.current_status));
  const perdidos = (history || []).filter(d => d.current_status === 'perdido');
  const substituidos = (history || []).filter(d => d.current_status === 'substituido');
  const baixados = (history || []).filter(d => d.current_status === 'baixado');

  const generatePdf = async () => {
    if (!selectedCollab || !history) return;
    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 20;
      const green = [20, 144, 71] as [number, number, number];
      const black = [0, 0, 0] as [number, number, number];

      doc.setFillColor(...green);
      doc.rect(0, 0, pageW, 4, 'F');

      let y = 20;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...green);
      doc.text('Relatório de EPIs — Desligamento', pageW / 2, y, { align: 'center' });

      y += 12;
      doc.setFontSize(11);
      doc.setTextColor(...black);
      doc.setFont('helvetica', 'bold');
      doc.text(`Colaborador: ${selectedCollab.full_name}`, margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.text(`Cargo: ${selectedCollab.role_name || '—'}`, margin, y);
      y += 6;
      doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, margin, y);

      const drawTable = (title: string, items: any[], startY: number) => {
        let ty = startY + 10;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...green);
        doc.text(title, margin, ty);
        ty += 6;

        if (items.length === 0) {
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(150, 150, 150);
          doc.text('Nenhum item', margin + 4, ty);
          return ty + 4;
        }

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...black);
        doc.text('EPI', margin, ty);
        doc.text('CA', margin + 70, ty);
        doc.text('Qtd', margin + 100, ty);
        doc.text('Entrega', margin + 115, ty);
        ty += 5;

        doc.setFont('helvetica', 'normal');
        items.forEach(d => {
          if (ty > 270) { doc.addPage(); ty = 20; }
          doc.text(d.epi_item?.name || '—', margin, ty, { maxWidth: 65 });
          doc.text(d.epi_item?.ca_number || '—', margin + 70, ty);
          doc.text(String(d.quantity), margin + 100, ty);
          doc.text(new Date(d.delivered_at).toLocaleDateString('pt-BR'), margin + 115, ty);
          ty += 5;
        });
        return ty;
      };

      y = drawTable(`Devolvidos (${devolvidos.length})`, devolvidos, y);
      y = drawTable(`Pendentes (${pendentes.length})`, pendentes, y);
      y = drawTable(`Perdidos (${perdidos.length})`, perdidos, y);
      y = drawTable(`Substituídos (${substituidos.length})`, substituidos, y);
      y = drawTable(`Baixados (${baixados.length})`, baixados, y);

      // Footer
      const footerY = doc.internal.pageSize.getHeight() - 15;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('SV Engenharia • Relatório gerado automaticamente', pageW / 2, footerY, { align: 'center' });

      const safeName = selectedCollab.full_name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      doc.save(`Relatorio_EPIs_Desligamento_${safeName}.pdf`);

      // Audit log
      await supabase.from('audit_logs').insert({ user_id: user!.id, action: 'epi_dismissal_report', entity_type: 'collaborators', entity_id: selectedId, details: { collaborator_name: selectedCollab.full_name, total_items: history.length } });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><FileText className="w-6 h-6 text-primary" /> Relatório de Desligamento</h1>
        <p className="text-sm text-muted-foreground">Conferência completa de EPIs para desligamento</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="max-w-md space-y-1.5">
            <label className="text-xs font-medium">Selecione o Colaborador</label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue placeholder="Escolha um colaborador" /></SelectTrigger>
              <SelectContent>{(collaborators || []).map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedId && selectedCollab && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="text-center"><CardContent className="pt-4"><p className="text-2xl font-bold text-primary">{devolvidos.length}</p><p className="text-xs text-muted-foreground">Devolvidos</p></CardContent></Card>
            <Card className="text-center"><CardContent className="pt-4"><p className="text-2xl font-bold text-orange-500">{pendentes.length}</p><p className="text-xs text-muted-foreground">Pendentes</p></CardContent></Card>
            <Card className="text-center"><CardContent className="pt-4"><p className="text-2xl font-bold text-destructive">{perdidos.length}</p><p className="text-xs text-muted-foreground">Perdidos</p></CardContent></Card>
            <Card className="text-center"><CardContent className="pt-4"><p className="text-2xl font-bold">{substituidos.length}</p><p className="text-xs text-muted-foreground">Substituídos</p></CardContent></Card>
            <Card className="text-center"><CardContent className="pt-4"><p className="text-2xl font-bold">{baixados.length}</p><p className="text-xs text-muted-foreground">Baixados</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Detalhamento</CardTitle>
              <Button onClick={generatePdf} disabled={generating || isLoading} className="gap-2" size="sm">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Gerar PDF
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : !history?.length ? (
                <p className="text-center py-8 text-muted-foreground">Nenhum EPI registrado</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border text-left">
                    <th className="py-2 px-3 font-medium text-muted-foreground">EPI</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">CA</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground">Qtd</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Entrega</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground">Status</th>
                  </tr></thead>
                  <tbody>
                    {history.map(d => (
                      <tr key={d.id} className="border-b last:border-0">
                        <td className="py-2.5 px-3 font-medium">{d.epi_item?.name}</td>
                        <td className="py-2.5 px-3 hidden md:table-cell">{d.epi_item?.ca_number || '—'}</td>
                        <td className="py-2.5 px-3">{d.quantity}</td>
                        <td className="py-2.5 px-3 hidden md:table-cell">{new Date(d.delivered_at).toLocaleDateString('pt-BR')}</td>
                        <td className="py-2.5 px-3"><StatusBadge status={d.current_status} label={EPI_DELIVERY_STATUS_LABELS[d.current_status] || d.current_status} variant={d.current_status === 'devolvido' ? 'approved' : d.current_status === 'perdido' ? 'rejected' : 'pending'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
