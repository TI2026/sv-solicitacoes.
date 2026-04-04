import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Download, Loader2, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import { formatDateBR } from '@/lib/dateUtils';
import logoSv from '@/assets/logo-sv.png';

interface WelcomePdfGeneratorProps {
  candidateName: string;
  cargoFuncao: string;
  admissionId: string;
  defaultLocal?: string;
  defaultResponsavel?: string;
  defaultContato?: string;
  dataPrevistaInicio?: string | null;
}

function loadImageAsBase64(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
      resolve(canvas.toDataURL('image/png', 1.0));
    };
    img.onerror = () => reject(new Error('Failed to load logo'));
    img.src = src;
  });
}

export function WelcomePdfGenerator({ candidateName, cargoFuncao, admissionId, defaultLocal, defaultResponsavel, defaultContato, dataPrevistaInicio }: WelcomePdfGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    local: defaultLocal || '',
    responsavel: defaultResponsavel || '',
    contato: defaultContato || '',
  });

  const generatePdf = async () => {
    if (!form.local || !form.responsavel) {
      toast({ title: 'Preencha local e responsável', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 25;
      const green = [20, 144, 71] as [number, number, number];
      const black = [0, 0, 0] as [number, number, number];
      const darkGray = [60, 60, 60] as [number, number, number];

      // Thin accent line at the top
      doc.setFillColor(...green);
      doc.rect(0, 0, pageW, 4, 'F');

      // Centered logo
      let y = 18;
      try {
        const logoData = await loadImageAsBase64(logoSv);
        const logoSize = 32;
        const logoX = (pageW - logoSize) / 2;
        doc.addImage(logoData, 'PNG', logoX, y, logoSize, logoSize);
        y += logoSize + 10;
      } catch {
        doc.setTextColor(...green);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('SV ENGENHARIA', pageW / 2, y + 16, { align: 'center' });
        y += 30;
      }

      // Welcome title
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...green);
      doc.text('Bem-vindo(a)!', pageW / 2, y, { align: 'center' });

      // Candidate name - PROMINENT
      y += 16;
      doc.setFontSize(16);
      doc.setTextColor(...black);
      doc.setFont('helvetica', 'bold');
      doc.text(candidateName, pageW / 2, y, { align: 'center' });

      // Cargo
      y += 9;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkGray);
      doc.text(cargoFuncao, pageW / 2, y, { align: 'center' });

      y += 12;
      doc.setFontSize(11);
      doc.setTextColor(...black);
      doc.text('Seja bem-vindo(a) à equipe! Segue abaixo as informações para sua apresentação:', pageW / 2, y, { align: 'center', maxWidth: pageW - margin * 2 });

      // Info box
      const hasDataInicio = !!dataPrevistaInicio;
      const boxH = hasDataInicio ? 74 : 60;
      y += 16;
      const boxX = margin;
      const boxW = pageW - margin * 2;
      doc.setDrawColor(...green);
      doc.setLineWidth(0.5);
      doc.roundedRect(boxX, y, boxW, boxH, 3, 3, 'S');

      const infoX = margin + 10;
      y += 14;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...green);
      doc.text('Local de apresentação:', infoX, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...black);
      doc.text(form.local, infoX + 52, y);

      y += 14;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...green);
      doc.text('Pessoa responsável:', infoX, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...black);
      doc.text(form.responsavel, infoX + 47, y);

      y += 14;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...green);
      doc.text('Contato:', infoX, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...black);
      doc.text(form.contato || '—', infoX + 20, y);

      if (hasDataInicio) {
        y += 14;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...green);
        doc.text('Data de início:', infoX, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...black);
        doc.text(formatDateBR(dataPrevistaInicio!), infoX + 34, y);
      }

      // Closing message
      y += 30;
      doc.setFontSize(11);
      doc.setTextColor(...black);
      doc.setFont('helvetica', 'italic');
      const closingLines = doc.splitTextToSize(
        'Estamos felizes em receber você e desejamos muito sucesso nesta nova etapa com a SV.',
        pageW - margin * 2
      );
      doc.text(closingLines, pageW / 2, y, { align: 'center' });

      // Social media section
      y += 20;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkGray);
      doc.text('Siga-nos nas redes sociais:', pageW / 2, y, { align: 'center' });

      y += 6;
      doc.setTextColor(...green);
      doc.setFont('helvetica', 'bold');
      doc.text('Facebook:', margin + 10, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...black);
      doc.textWithLink('facebook.com/svengenhariaeservicos', margin + 35, y, { url: 'https://www.facebook.com/svengenhariaeservicos' });

      y += 5.5;
      doc.setTextColor(...green);
      doc.setFont('helvetica', 'bold');
      doc.text('Instagram:', margin + 10, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...black);
      doc.textWithLink('@svengenhariaeservicos', margin + 35, y, { url: 'https://www.instagram.com/svengenhariaeservicos' });

      y += 5.5;
      doc.setTextColor(...green);
      doc.setFont('helvetica', 'bold');
      doc.text('WhatsApp:', margin + 10, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...black);
      doc.textWithLink('+55 54 99697-1327', margin + 35, y, { url: 'https://wa.me/5554996971327' });

      // Footer
      const footerY = pageH - 20;
      doc.setDrawColor(...green);
      doc.setLineWidth(0.3);
      doc.line(margin, footerY - 5, pageW - margin, footerY - 5);

      doc.setFontSize(9);
      doc.setTextColor(...green);
      doc.setFont('helvetica', 'normal');
      doc.textWithLink('https://svengenharia.srv.br/', pageW / 2, footerY, {
        align: 'center',
        url: 'https://svengenharia.srv.br/',
      });

      doc.setFontSize(8);
      doc.setTextColor(...black);
      doc.text('SV Engenharia • Documento gerado automaticamente', pageW / 2, footerY + 6, { align: 'center' });

      // Save with candidate name in filename
      const safeName = candidateName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      doc.save(`Apresentacao_${safeName}.pdf`);

      // Persist welcome_pdf_generated_at
      await supabase
        .from('admission_requests')
        .update({ welcome_pdf_generated_at: new Date().toISOString() } as any)
        .eq('id', admissionId);
      qc.invalidateQueries({ queryKey: ['admission_request', admissionId] });
      qc.invalidateQueries({ queryKey: ['admission_list_items'] });
      qc.invalidateQueries({ queryKey: ['adm_all'] });

      toast({ title: 'PDF gerado com sucesso!' });
      setOpen(false);
    } catch (err: any) {
      toast({ title: 'Erro ao gerar PDF', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
        <FileText className="w-4 h-4" /> Gerar PDF de Apresentação
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>PDF de Boas-vindas — {candidateName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Local de Apresentação *</Label>
              <Input value={form.local} onChange={e => setForm(p => ({ ...p, local: e.target.value }))} placeholder="Endereço ou obra" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pessoa Responsável *</Label>
              <Input value={form.responsavel} onChange={e => setForm(p => ({ ...p, responsavel: e.target.value }))} placeholder="Nome do gestor/responsável" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Contato do Responsável</Label>
              <Input value={form.contato} onChange={e => setForm(p => ({ ...p, contato: e.target.value }))} placeholder="Telefone ou email" />
            </div>
            {dataPrevistaInicio && (
              <div className="text-xs text-muted-foreground">
                Data de início: <strong>{formatDateBR(dataPrevistaInicio)}</strong>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={generatePdf} disabled={generating || !form.local || !form.responsavel} className="gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Gerar e Baixar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
