import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Package, Search, Eye, FileDown, Trash2, Wand2 } from 'lucide-react';
import { useEpiDeliveries, useCreateDelivery, useCollaboratorsWithProfiles, useCreateCollaborator, useEpiItems, useEpiKitRules } from '../hooks/useEpiQueries';
import { EPI_DELIVERY_STATUS_LABELS, EPI_REASON_LABELS } from '../types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StatusBadge } from '@/components/StatusBadge';
import { SignaturePad } from '../components/SignaturePad';
import { PhotoUpload } from '../components/PhotoUpload';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { maskCPF } from '@/lib/masks';
import { useSectors } from '@/modules/permissions/hooks/usePermissionsData';
import jsPDF from 'jspdf';
import { useToast } from '@/hooks/use-toast';

interface DeliveryLineItem {
  id: string; // local key
  epi_item_id: string;
  quantity: string;
  size: string;
  reason: string;
  notes: string;
  fromKit: boolean; // whether this came from kit suggestion
}

const newLine = (epiItemId = '', qty = '1', fromKit = false): DeliveryLineItem => ({
  id: crypto.randomUUID(),
  epi_item_id: epiItemId,
  quantity: qty,
  size: '',
  reason: 'primeira_entrega',
  notes: '',
  fromKit,
});

export default function EpiDeliveryPage() {
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const { data: deliveries, isLoading } = useEpiDeliveries();
  const { data: collaborators } = useCollaboratorsWithProfiles({ active: true });
  const { data: epiItems } = useEpiItems({ active: true });
  const { data: sectors } = useSectors();
  const { data: allKitRules } = useEpiKitRules();
  const createDelivery = useCreateDelivery();
  const createCollaborator = useCreateCollaborator();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Header fields
  const [collaboratorId, setCollaboratorId] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [worksite, setWorksite] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');

  // Multi-item lines
  const [lines, setLines] = useState<DeliveryLineItem[]>([newLine()]);

  const [sigEmployee, setSigEmployee] = useState<string | null>(null);
  const [sigResponsible, setSigResponsible] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setCollaboratorId('');
    setSectorId('');
    setWorksite('');
    setGeneralNotes('');
    setLines([newLine()]);
    setSigEmployee(null);
    setSigResponsible(null);
  }, []);

  // Pre-select collaborator from querystring
  useEffect(() => {
    const collabId = searchParams.get('collaboratorId');
    if (collabId && collaborators) {
      const collab = collaborators.find((c: any) => c.id === collabId);
      if (collab) {
        setCollaboratorId(collabId);
        setSectorId(collab.sector_id || '');
        setWorksite(collab.worksite || '');
        setDialogOpen(true);
      }
    }
  }, [searchParams, collaborators]);

  // When collaborator changes, auto-load kit rules
  const handleCollaboratorChange = useCallback((id: string) => {
    setCollaboratorId(id);
    const collab = collaborators?.find((c: any) => c.id === id);
    if (collab) {
      setSectorId(collab.sector_id || '');
      setWorksite(collab.worksite || '');
    }
    // Don't auto-load kit here; user clicks "Carregar Kit" button
  }, [collaborators]);

  const loadKitForCollaborator = useCallback(() => {
    const collab = collaborators?.find((c: any) => c.id === collaboratorId);
    if (!collab || !allKitRules?.length) {
      toast({ title: 'Nenhuma regra de kit encontrada', description: 'Configure regras de kit por setor/cargo primeiro.', variant: 'destructive' });
      return;
    }

    const sId = sectorId || collab.sector_id;
    const roleName = collab.role_name || '';

    // Match rules: same sector or no sector (global), and same role or no role (global)
    const matchingRules = allKitRules.filter((r: any) => {
      const sectorMatch = !r.sector_id || r.sector_id === sId;
      const roleMatch = !r.role_name || r.role_name === roleName;
      return sectorMatch && (roleMatch || !roleName);
    });

    if (matchingRules.length === 0) {
      toast({ title: 'Nenhuma regra de kit encontrada', description: `Sem regras para o setor/cargo deste colaborador.`, variant: 'destructive' });
      return;
    }

    // Remove existing non-manual empty lines, keep manual ones
    const manualLines = lines.filter(l => !l.fromKit && l.epi_item_id);

    const kitLines: DeliveryLineItem[] = matchingRules.map((r: any) =>
      newLine(r.epi_item_id, String(r.quantity || 1), true)
    );

    // Avoid duplicates with manual lines
    const manualItemIds = new Set(manualLines.map(l => l.epi_item_id));
    const uniqueKitLines = kitLines.filter(l => !manualItemIds.has(l.epi_item_id));

    const combined = [...uniqueKitLines, ...manualLines];
    setLines(combined.length > 0 ? combined : [newLine()]);
    toast({ title: `${uniqueKitLines.length} item(ns) do kit carregados` });
  }, [collaboratorId, collaborators, allKitRules, sectorId, lines, toast]);

  const updateLine = (id: string, field: keyof DeliveryLineItem, value: string) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value, fromKit: field === 'epi_item_id' ? false : l.fromKit } : l));
  };

  const removeLine = (id: string) => {
    setLines(prev => {
      const next = prev.filter(l => l.id !== id);
      return next.length > 0 ? next : [newLine()];
    });
  };

  const addLine = () => setLines(prev => [...prev, newLine()]);

  const validLines = lines.filter(l => l.epi_item_id);

  const handleSave = async (generatePdf = false) => {
    if (!collaboratorId || validLines.length === 0) return;
    setSaving(true);

    try {
      let collab = collaborators?.find((c: any) => c.id === collaboratorId);

      // Auto-create collaborator from profile if needed
      let realCollaboratorId = collaboratorId;
      if (collab?._isProfileOnly) {
        const newCollab = await createCollaborator.mutateAsync({
          full_name: collab.full_name,
          email: collab.email || '',
          user_profile_id: collab._profileId,
          sector_id: sectorId || collab.sector_id || null,
          worksite: worksite || '',
        });
        realCollaboratorId = newCollab.id;
        collab = { ...collab, ...newCollab };
      }

      // Upload signatures once
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

      // Create one delivery per line
      for (const line of validLines) {
        await createDelivery.mutateAsync({
          collaborator_id: realCollaboratorId,
          epi_item_id: line.epi_item_id,
          quantity: parseInt(line.quantity) || 1,
          size: line.size || null,
          sector_id: collab?.sector_id || sectorId || null,
          worksite: worksite || collab?.worksite || '',
          reason: line.reason,
          notes: line.notes || generalNotes,
          signature_employee_url: sigEmployeeUrl,
          signature_responsible_url: sigResponsibleUrl,
        });
      }

      if (generatePdf && collab) {
        generateDeliveryPdf(collab, validLines);
      }

      toast({ title: `${validLines.length} entrega(s) registrada(s) com sucesso` });
      setDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast({ title: 'Erro ao registrar entregas', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const generateDeliveryPdf = (collab: any, pdfLines: DeliveryLineItem[]) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 20;
    const green: [number, number, number] = [20, 144, 71];

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
    const sectorObj = sectors?.find((s: any) => s.id === (sectorId || collab.sector_id));
    field('Setor:', sectorObj?.name || '—', margin + 3, y + 20);
    field('Obra/Local:', worksite || collab.worksite || '—', margin + 3, y + 26);
    field('Data:', new Date().toLocaleDateString('pt-BR'), margin + 3, y + 32);

    if (collab.email) field('Email:', collab.email, pageW / 2, y + 8);
    if (collab.telefone) field('Telefone:', collab.telefone, pageW / 2, y + 14);

    // EPI table
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
    for (const line of pdfLines) {
      const epiItem = epiItems?.find((e: any) => e.id === line.epi_item_id);
      if (!epiItem) continue;
      doc.text(epiItem.name, margin + 2, y, { maxWidth: 65 });
      doc.text(epiItem.ca_number || '—', margin + 70, y);
      doc.text(line.quantity, margin + 100, y);
      doc.text(line.size || '—', margin + 115, y);
      doc.text(EPI_REASON_LABELS[line.reason] || line.reason, margin + 130, y);
      y += 7;
      if (y > 260) { doc.addPage(); y = 20; }
    }

    if (generalNotes) {
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.text('Observações:', margin, y);
      doc.setFont('helvetica', 'normal');
      y += 5;
      doc.text(generalNotes, margin, y, { maxWidth: pageW - 2 * margin });
      y += 8;
    }

    y += 10;
    if (sigEmployee) {
      doc.setFont('helvetica', 'bold');
      doc.text('Assinatura do Colaborador:', margin, y);
      y += 3;
      try { doc.addImage(sigEmployee, 'PNG', margin, y, 60, 24); } catch {}
      y += 28;
    }
    if (sigResponsible) {
      doc.setFont('helvetica', 'bold');
      doc.text('Assinatura do Responsável:', margin, y);
      y += 3;
      try { doc.addImage(sigResponsible, 'PNG', margin, y, 60, 24); } catch {}
      y += 28;
    }

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

  // PDF for existing delivery
  const handleDownloadExisting = (d: any) => {
    if (!d.collaborator || !d.epi_item) return;
    const line: DeliveryLineItem = {
      id: d.id, epi_item_id: d.epi_item_id, quantity: String(d.quantity),
      size: d.size || '', reason: d.reason, notes: d.notes, fromKit: false,
    };
    setGeneralNotes(d.notes || '');
    setSectorId(d.sector_id || '');
    setWorksite(d.worksite || '');
    generateDeliveryPdf(d.collaborator, [line]);
  };

  const filtered = (deliveries || []).filter((d: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return d.collaborator?.full_name?.toLowerCase().includes(s) || d.epi_item?.name?.toLowerCase().includes(s) || d.epi_item?.code?.toLowerCase().includes(s);
  });

  const selectedCollab = collaborators?.find((c: any) => c.id === collaboratorId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Package className="w-6 h-6 text-primary" /> Entregas de EPI</h1>
          <p className="text-sm text-muted-foreground">Registre e acompanhe entregas de equipamentos</p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> Nova Entrega</Button>
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

      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) resetForm(); setDialogOpen(v); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Entrega de EPI</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Header: collaborator + sector */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5 md:col-span-1">
                <Label className="text-xs">Colaborador *</Label>
                <Select value={collaboratorId} onValueChange={handleCollaboratorChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                  <SelectContent>{(collaborators || []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.full_name}{c.role_name ? ` — ${c.role_name}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Setor</Label>
                <Select value={sectorId || 'none'} onValueChange={v => setSectorId(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {(sectors || []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Obra / Local</Label>
                <Input value={worksite} onChange={e => setWorksite(e.target.value)} />
              </div>
            </div>

            {/* Kit loader button */}
            {collaboratorId && (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={loadKitForCollaborator} className="gap-1.5">
                  <Wand2 className="w-4 h-4" /> Carregar Kit do Setor/Cargo
                </Button>
                {selectedCollab && (
                  <span className="text-xs text-muted-foreground">
                    {selectedCollab.role_name ? `Cargo: ${selectedCollab.role_name}` : 'Sem cargo definido'}
                  </span>
                )}
              </div>
            )}

            {/* Item lines */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Itens da Entrega</Label>
                <span className="text-xs text-muted-foreground">{validLines.length} item(ns)</span>
              </div>

              <div className="border border-border rounded-lg divide-y divide-border">
                {lines.map((line, idx) => {
                  const selectedItem = epiItems?.find((e: any) => e.id === line.epi_item_id);
                  return (
                    <div key={line.id} className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground w-6">{idx + 1}.</span>
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_80px_80px_120px] gap-2 items-end">
                          <div className="space-y-1">
                            <Label className="text-xs">EPI *</Label>
                            <Select value={line.epi_item_id} onValueChange={v => updateLine(line.id, 'epi_item_id', v)}>
                              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o EPI" /></SelectTrigger>
                              <SelectContent>{(epiItems || []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Qtd</Label>
                            <Input type="number" min="1" className="h-9" value={line.quantity} onChange={e => updateLine(line.id, 'quantity', e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Tamanho</Label>
                            <Input className="h-9" value={line.size} onChange={e => updateLine(line.id, 'size', e.target.value)} placeholder={selectedItem?.size_required ? 'Obrig.' : 'Opc.'} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Motivo</Label>
                            <Select value={line.reason} onValueChange={v => updateLine(line.id, 'reason', v)}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(EPI_REASON_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive shrink-0" onClick={() => removeLine(line.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      {line.fromKit && (
                        <span className="ml-8 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">Do Kit</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-1.5 w-full">
                <Plus className="w-4 h-4" /> Adicionar Item
              </Button>
            </div>

            {/* General notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Observações Gerais</Label>
              <Textarea value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} rows={2} />
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border">
              <SignaturePad label="Assinatura do Colaborador" onSave={setSigEmployee} />
              <SignaturePad label="Assinatura do Responsável" onSave={setSigResponsible} />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>Cancelar</Button>
            <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving || !collaboratorId || validLines.length === 0}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Salvar ({validLines.length})
            </Button>
            <Button onClick={() => handleSave(true)} disabled={saving || !collaboratorId || validLines.length === 0} className="gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              <FileDown className="w-4 h-4" /> Salvar e Gerar Comprovante
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
