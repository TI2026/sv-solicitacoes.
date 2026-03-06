import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Download, Loader2, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';

interface WelcomePdfGeneratorProps {
  candidateName: string;
  cargoFuncao: string;
  admissionId: string;
  defaultLocal?: string;
  defaultResponsavel?: string;
  defaultContato?: string;
}

export function WelcomePdfGenerator({ candidateName, cargoFuncao, admissionId, defaultLocal, defaultResponsavel, defaultContato }: WelcomePdfGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();
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
      const green = [20, 144, 71] as [number, number, number]; // #149047

      // Header bar
      doc.setFillColor(...green);
      doc.rect(0, 0, pageW, 18, 'F');

      // Company name in header
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('SV ENGENHARIA', margin, 12);

      // Reset text color
      doc.setTextColor(50, 50, 50);

      // Welcome title
      let y = 45;
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...green);
      doc.text('Bem-vindo(a)!', pageW / 2, y, { align: 'center' });

      // Greeting
      y += 18;
      doc.setFontSize(13);
      doc.setTextColor(60, 60, 60);
      doc.setFont('helvetica', 'normal');
      doc.text(`Olá, ${candidateName}!`, pageW / 2, y, { align: 'center' });

      y += 12;
      doc.setFontSize(11);
      doc.text('Seja bem-vindo(a) à equipe!', pageW / 2, y, { align: 'center' });

      y += 10;
      doc.text('Segue abaixo as informações para sua apresentação:', pageW / 2, y, { align: 'center' });

      // Info box
      y += 16;
      const boxX = margin;
      const boxW = pageW - margin * 2;
      const boxH = 60;
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
      doc.setTextColor(60, 60, 60);
      doc.text(form.local, infoX + 52, y);

      y += 14;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...green);
      doc.text('Pessoa responsável:', infoX, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(form.responsavel, infoX + 47, y);

      y += 14;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...green);
      doc.text('Contato:', infoX, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(form.contato || '—', infoX + 20, y);

      // Closing message
      y += 30;
      doc.setFontSize(11);
      doc.setTextColor(80, 80, 80);
      doc.setFont('helvetica', 'italic');
      const closingLines = doc.splitTextToSize(
        'Estamos felizes em receber você e desejamos muito sucesso nesta nova etapa com a SV.',
        pageW - margin * 2
      );
      doc.text(closingLines, pageW / 2, y, { align: 'center' });

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
      doc.setTextColor(150, 150, 150);
      doc.text('SV Engenharia • Documento gerado automaticamente', pageW / 2, footerY + 6, { align: 'center' });

      doc.save(`Boas-vindas_${candidateName.replace(/\s+/g, '_')}.pdf`);
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
