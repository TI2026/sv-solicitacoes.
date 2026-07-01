import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toTimestampTZ } from '@/lib/dateUtils';
import { minDateToday } from '@/lib/masks';
import { useInterviewConductors } from '../hooks/useAdmissionQueries';

const RESULT_OPTIONS = [
  { value: '', label: 'Não definido (agendar apenas)' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'reprovado', label: 'Reprovado' },
  { value: 'segunda_fase', label: 'Segunda fase' },
  { value: 'aguardando', label: 'Aguardando' },
];

interface InterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  onSave: (data: {
    interview_at: string;
    interview_address: string;
    interview_city: string;
    interviewer_name: string;
    interview_notes?: string;
    interview_mode?: string;
    meeting_link?: string;
    conducted_by?: string;
    result?: string;
  }) => Promise<void>;
}

export function InterviewDialog({ open, onOpenChange, candidateName, onSave }: InterviewDialogProps) {
  const { data: conductors } = useInterviewConductors();
  const [form, setForm] = useState({
    date: '',
    time: '',
    address: '',
    city: '',
    interviewer: '',
    conductedBy: '',
    notes: '',
    mode: 'presencial',
    meetingLink: '',
    result: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const isOnline = form.mode === 'online';

  // When conductor is selected, auto-fill interviewer name
  const handleConductorChange = (userId: string) => {
    set('conductedBy', userId);
    const conductor = conductors?.find((c: any) => c.id === userId);
    if (conductor) {
      set('interviewer', conductor.full_name);
    }
  };

  const handleSave = async () => {
    if (!form.date || !form.time || !form.interviewer) return;
    if (isOnline && !form.meetingLink.trim()) return;
    setSaving(true);
    try {
      await onSave({
        interview_at: toTimestampTZ(form.date, form.time),
        interview_address: isOnline ? '' : form.address,
        interview_city: isOnline ? '' : form.city,
        interviewer_name: form.interviewer,
        interview_notes: form.notes || undefined,
        interview_mode: form.mode,
        meeting_link: isOnline ? form.meetingLink.trim() : undefined,
        conducted_by: form.conductedBy || undefined,
        result: form.result || undefined,
      });
      onOpenChange(false);
      setForm({ date: '', time: '', address: '', city: '', interviewer: '', conductedBy: '', notes: '', mode: 'presencial', meetingLink: '', result: '' });
    } finally {
      setSaving(false);
    }
  };

  const canSave = form.date && form.time && form.interviewer && (!isOnline || form.meetingLink.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar Entrevista — {candidateName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de Entrevista *</Label>
            <Select value={form.mode} onValueChange={v => set('mode', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="presencial">Presencial</SelectItem>
                <SelectItem value="online">Online</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Data *</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} min={minDateToday()} />
              {form.date && form.date < minDateToday() && (
                <p className="text-xs text-destructive">A entrevista deve ser agendada para hoje ou uma data futura.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Hora *</Label>
              <Input type="time" value={form.time} onChange={e => set('time', e.target.value)} />
            </div>
          </div>

          {isOnline ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Link da Reunião *</Label>
              <Input
                value={form.meetingLink}
                onChange={e => set('meetingLink', e.target.value)}
                placeholder="https://meet.google.com/... ou https://zoom.us/..."
                type="url"
              />
              <p className="text-[10px] text-muted-foreground">Cole o link do Google Meet, Zoom, Teams ou similar.</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Endereço</Label>
                <Input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Rua, número" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cidade</Label>
                <Input value={form.city} onChange={e => set('city', e.target.value)} />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Responsável pela Entrevista *</Label>
            {conductors && conductors.length > 0 ? (
              <Select value={form.conductedBy} onValueChange={handleConductorChange}>
                <SelectTrigger><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
                <SelectContent>
                  {conductors.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={form.interviewer} onChange={e => set('interviewer', e.target.value)} placeholder="Nome de quem vai entrevistar" />
            )}
            {form.conductedBy && (
              <p className="text-[10px] text-muted-foreground">Entrevistador: {form.interviewer}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Resultado</Label>
            <Select value={form.result} onValueChange={v => set('result', v)}>
              <SelectTrigger><SelectValue placeholder="Não definido (agendar apenas)" /></SelectTrigger>
              <SelectContent>
                {RESULT_OPTIONS.map(o => (
                  <SelectItem key={o.value || '_empty'} value={o.value || '_empty'}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">Pode ser preenchido depois, ao registrar o resultado.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !canSave || (!!form.date && form.date < minDateToday())}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}