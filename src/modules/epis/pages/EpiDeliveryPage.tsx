import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Package, Search, Eye, FileDown } from 'lucide-react';
import { useEpiDeliveries, useCreateDelivery, useCollaborators, useEpiItems } from '../hooks/useEpiQueries';
import { EPI_DELIVERY_STATUS_LABELS, EPI_REASON_LABELS } from '../types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StatusBadge } from '@/components/StatusBadge';
import { SignaturePad } from '../components/SignaturePad';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { maskCPF } from '@/lib/masks';
import { useSectors } from '@/modules/permissions/hooks/usePermissionsData';
import jsPDF from 'jspdf';

export default function EpiDeliveryPage() {
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const { data: deliveries, isLoading } = useEpiDeliveries();
  const { data: collaborators } = useCollaborators({ active: true });
  const { data: epiItems } = useEpiItems({ active: true });
  const { data: sectors } = useSectors();
  const createDelivery = useCreateDelivery();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ collaborator_id: '', epi_item_id: '', quantity: '1', size: '', sector_id: '', worksite: '', reason: 'primeira_entrega', notes: '' });
  const [sigEmployee, setSigEmployee] = useState<string | null>(null);
  const [sigResponsible, setSigResponsible] = useState<string | null>(null);

  // Pre-select collaborator from querystring (from admission flow)
  useEffect(() => {
    const collabId = searchParams.get('collaboratorId');
    if (collabId && collaborators) {
      const collab = collaborators.find((c: any) => c.id === collabId);
      if (collab) {
        setForm(f => ({
          ...f,
          collaborator_id: collabId,
          sector_id: collab.sector_id || '',
          worksite: collab.worksite || '',
        }));
        setDialogOpen(true);
      }
    }
  }, [searchParams, collaborators]);

  const handleSave = async (generatePdf = false) => {
    if (!form.collaborator_id || !form.epi_item_id) return;
    const collab = collaborators?.find((c: any) => c.id === form.collaborator_id);
    const epiItem = epiItems?.find((e: any) => e.id === form.epi_item_id);

    let sigEmployeeUrl: string | null = null;
    let sigResponsibleUrl: string | null = null;

    if (sigEmployee) {
      const blob = await (await fetch(sigEmployee)).blob();
      const path = `signatures/${Date.now()}_employee.png`;
      const { error } = await supabase.storage.from('epis').upload(path, blob, { contentType: 'image/png' });
      if (!error) sigEmployeeUrl = path;
    }
    if (sigResponsible) {
      const blob = await (await fetch(sigResponsible)).blob();
      const path = `signatures/${Date.now()}_responsible.png`;
      const { error } = await supabase.storage.from('epis').upload(path, blob, { contentType: 'image/png' });
      if (!error) sigResponsibleUrl = path;
    }

    await createDelivery.mutateAsync({
      collaborator_id: form.collaborator_id,
      epi_item_id: form.epi_item_id,
      quantity: parseInt(form.quantity) || 1,
      size: form.size || null,
      sector_id: collab?.sector_id || null,
      worksite: form.worksite || collab?.worksite || '',
      reason: form.reason,
      notes: form.notes,
      signature_employee_url: sigEmployeeUrl,
      signature_responsible_url: sigResponsibleUrl,
    });

    if (generatePdf && collab && epiItem) {
      generateDeliveryPdf(collab, epiItem, form, sigEmployee, sigResponsible);
    }

    setDialogOpen(false);
    setForm({ collaborator_id: '', epi_item_id: '', quantity: '1', size: '', sector_id: '', worksite: '', reason: 'primeira_entrega', notes: '' });
    setSigEmployee(null);
    setSigResponsible(null);
  };

  const generateDeliveryPdf = (collab: any, epiItem: any, formData: typeof form, sigEmp: string | null, sigResp: string | null) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 20;
    const green: [number, number, number] = [20, 144, 71];

    // Header bar
    doc.setFillColor(...green);
    doc.rect(0, 0, pageW, 4, 'F');

    let y = 20;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...green);
    doc.text('Comprovante de Entrega de EPI', pageW / 2, y, { align: 'center' });

    y += 4;
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.text('SV Engenharia', pageW / 2, y + 5, { align: 'center' });

    // Collaborator data section
    y += 16;
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, y - 3, pageW - 2 * margin, 42, 'F');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    const field = (label: string, value: string, x: number, yPos: number) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, x, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(value || '—', x + doc.getTextWidth(label) + 2, yPos);
    };

    field('Colaborador:', collab.full_name, margin + 3, y + 2);
    field('CPF:', collab.cpf ? maskCPF(collab.cpf) : '—', margin + 3, y + 8);
    field('Cargo:', collab.role_name || '—', margin + 3, y + 14);
    field('Setor:', collab.sector?.name || '—', margin + 3, y + 20);
    field('Obra/Local:', formData.worksite || collab.worksite || '—', margin + 3, y + 26);
    field('Data:', new Date().toLocaleDateString('pt-BR'), margin + 3, y + 32);

    if (collab.email) {
      field('Email:', collab.email, pageW / 2, y + 8);
    }
    if (collab.telefone) {
      field('Telefone:', collab.telefone, pageW / 2, y + 14);
    }

    // EPI table header
    y += 48;
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y, pageW - 2 * margin, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('EPI', margin + 2, y + 5.5);
    doc.text('CA', margin + 70, y + 5.5);
    doc.text('Qtd', margin + 100, y + 5.5);
    doc.text('Tam.', margin + 115, y + 5.5);
    doc.text('Motivo', margin + 130, y + 5.5);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.text(epiItem.name, margin + 2, y, { maxWidth: 65 });
    doc.text(epiItem.ca_number || '—', margin + 70, y);
    doc.text(formData.quantity, margin + 100, y);
    doc.text(formData.size || '—', margin + 115, y);
    doc.text(EPI_REASON_LABELS[formData.reason] || formData.reason, margin + 130, y);

    if (formData.notes) {
      y += 10;
      doc.setFont('helvetica', 'bold');
      doc.text('Observações:', margin, y);
      doc.setFont('helvetica', 'normal');
      y += 5;
      doc.text(formData.notes, margin, y, { maxWidth: pageW - 2 * margin });
    }

    // Signatures
    y += 15;
    if (sigEmp) {
      doc.setFont('helvetica', 'bold');
      doc.text('Assinatura do Colaborador:', margin, y);
      y += 3;
      try { doc.addImage(sigEmp, 'PNG', margin, y, 60, 24); } catch {}
      y += 28;
    }
    if (sigResp) {
      doc.setFont('helvetica', 'bold');
      doc.text('Assinatura do Responsável:', margin, y);
      y += 3;
      try { doc.addImage(sigResp, 'PNG', margin, y, 60, 24); } catch {}
      y += 28;
    }

    // Declaration text
    y += 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(
      'Declaro ter recebido o(s) equipamento(s) de proteção individual acima descrito(s), comprometendo-me a utilizá-lo(s) corretamente durante a jornada de trabalho, conforme orientações recebidas.',
      margin, y, { maxWidth: pageW - 2 * margin }
    );

    const footerY = doc.internal.pageSize.getHeight() - 15;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('SV Engenharia • Comprovante gerado automaticamente', pageW / 2, footerY, { align: 'center' });

    const safeName = collab.full_name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    doc.save(`Comprovante_EPI_${safeName}_${Date.now()}.pdf`);
  };

  // Generate PDF for an existing delivery row
  const handleDownloadExisting = (d: any) => {
    if (!d.collaborator || !d.epi_item) return;
    generateDeliveryPdf(
      d.collaborator,
      d.epi_item,
      { collaborator_id: d.collaborator_id, epi_item_id: d.epi_item_id, quantity: String(d.quantity), size: d.size || '', sector_id: '', worksite: d.worksite || '', reason: d.reason, notes: d.notes },
      null, null
    );
  };

  const filtered = (deliveries || []).filter((d: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return d.collaborator?.full_name?.toLowerCase().includes(s) || d.epi_item?.name?.toLowerCase().includes(s) || d.epi_item?.code?.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Package className="w-6 h-6 text-primary" /> Entregas de EPI</h1>
          <p className="text-sm text-muted-foreground">Registre e acompanhe entregas de equipamentos</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Nova Entrega</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por colaborador ou EPI..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">Nenhuma entrega encontrada</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left">
                  <th className="py-2 px-3 font-medium text-muted-foreground">Colaborador</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">EPI</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Qtd</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Data</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground hidden lg:table-cell">Motivo</th>
                  <th className="py-2 px-3 w-24"></th>
                </tr></thead>
                <tbody>
                  {filtered.map((d: any) => (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="py-2.5 px-3 font-medium">{d.collaborator?.full_name || '—'}</td>
                      <td className="py-2.5 px-3">{d.epi_item?.name || '—'}{d.size ? ` (${d.size})` : ''}</td>
                      <td className="py-2.5 px-3 hidden md:table-cell">{d.quantity}</td>
                      <td className="py-2.5 px-3 hidden md:table-cell">{new Date(d.delivered_at).toLocaleDateString('pt-BR')}</td>
                      <td className="py-2.5 px-3"><StatusBadge status={d.current_status} label={EPI_DELIVERY_STATUS_LABELS[d.current_status] || d.current_status} /></td>
                      <td className="py-2.5 px-3 hidden lg:table-cell text-muted-foreground">{EPI_REASON_LABELS[d.reason] || d.reason}</td>
                      <td className="py-2.5 px-3 flex gap-1">
                        <Button variant="ghost" size="icon" title="Histórico" onClick={() => navigate(`/epis/history/${d.collaborator_id}`)}><Eye className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" title="Baixar Comprovante" onClick={() => handleDownloadExisting(d)}><FileDown className="w-4 h-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Entrega de EPI</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Colaborador *</Label>
                <Select value={form.collaborator_id} onValueChange={v => {
                  const collab = collaborators?.find((c: any) => c.id === v);
                  setForm(f => ({ ...f, collaborator_id: v, sector_id: collab?.sector_id || '', worksite: collab?.worksite || f.worksite }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                  <SelectContent>{(collaborators || []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.full_name}{c.role_name ? ` — ${c.role_name}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">EPI *</Label>
                <Select value={form.epi_item_id} onValueChange={v => setForm(f => ({ ...f, epi_item_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o EPI" /></SelectTrigger>
                  <SelectContent>{(epiItems || []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Quantidade</Label><Input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Tamanho</Label><Input value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} placeholder="P, M, G, 38..." /></div>
              <div className="space-y-1.5">
                <Label className="text-xs">Motivo</Label>
                <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(EPI_REASON_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Obra / Local</Label><Input value={form.worksite} onChange={e => setForm(f => ({ ...f, worksite: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Observações</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border">
              <SignaturePad label="Assinatura do Colaborador" onSave={setSigEmployee} />
              <SignaturePad label="Assinatura do Responsável" onSave={setSigResponsible} />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button variant="secondary" onClick={() => handleSave(false)} disabled={createDelivery.isPending || !form.collaborator_id || !form.epi_item_id}>
              {createDelivery.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Salvar
            </Button>
            <Button onClick={() => handleSave(true)} disabled={createDelivery.isPending || !form.collaborator_id || !form.epi_item_id} className="gap-1.5">
              {createDelivery.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              <FileDown className="w-4 h-4" /> Salvar e Gerar Comprovante
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
