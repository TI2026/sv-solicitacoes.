import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExportReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PeriodPreset = 'mes_atual' | 'mes_anterior' | 'trimestre' | 'personalizado';

function getPresetDates(preset: PeriodPreset): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (preset) {
    case 'mes_atual': {
      const start = new Date(y, m, 1);
      return { start: fmt(start), end: fmt(now) };
    }
    case 'mes_anterior': {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { start: fmt(start), end: fmt(end) };
    }
    case 'trimestre': {
      const start = new Date(y, m - 2, 1);
      return { start: fmt(start), end: fmt(now) };
    }
    default:
      return { start: '', end: '' };
  }
}

function fmt(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDateBR(d: string): string {
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function ExportReportDialog({ open, onOpenChange }: ExportReportDialogProps) {
  const [period, setPeriod] = useState<PeriodPreset>('mes_atual');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [format, setFormat] = useState<'xlsx' | 'pdf'>('xlsx');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    const dates = period === 'personalizado'
      ? { start: customStart, end: customEnd }
      : getPresetDates(period);

    if (!dates.start || !dates.end) {
      toast.error('Selecione o período');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-dashboard-report', {
        body: { startDate: dates.start, endDate: dates.end, format },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.isHtml && format === 'pdf') {
        // Open HTML in new window for printing as PDF
        const html = decodeURIComponent(escape(atob(data.base64)));
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (w) {
          w.onload = () => {
            setTimeout(() => w.print(), 500);
          };
        }
        toast.success('Relatório aberto para impressão/PDF');
      } else if (data?.base64) {
        // Download XLSX
        const byteChars = atob(data.base64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: data.mimeType });
        const url = URL.createObjectURL(blob);

        const now = new Date();
        const monthName = MONTH_NAMES[now.getMonth()];
        const fileName = `relatorio-despesas-${monthName}-${now.getFullYear()}.xlsx`;

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Relatório baixado com sucesso');
      }

      onOpenChange(false);
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error(err.message || 'Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" /> Exportar Relatório de Despesas
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Período</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mes_atual">Mês atual</SelectItem>
                <SelectItem value="mes_anterior">Mês anterior</SelectItem>
                <SelectItem value="trimestre">Último trimestre</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {period === 'personalizado' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data Inicial</Label>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data Final</Label>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            </div>
          )}

          {period !== 'personalizado' && (
            <p className="text-xs text-muted-foreground">
              {(() => {
                const d = getPresetDates(period);
                return `${formatDateBR(d.start)} a ${formatDateBR(d.end)}`;
              })()}
            </p>
          )}

          <div className="space-y-2">
            <Label>Formato</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as 'xlsx' | 'pdf')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                <SelectItem value="pdf">PDF (via impressão)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleExport} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Gerar Relatório
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
