import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toTimestampTZ } from '@/lib/dateUtils';

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
  }) => Promise<void>;
}

export function InterviewDialog({ open, onOpenChange, candidateName, onSave }: InterviewDialogProps) {
  const [form, setForm] = useState({
    date: '',
    time: '',
    address: '',
    city: '',
    interviewer: '',
    notes: '',
    mode: 'presencial',
    meetingLink: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const isOnline = form.mode === 'online';

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
      });
      onOpenChange(false);
      setForm({ date: '', time: '', address: '', city: '', interviewer: '', notes: '', mode: 'presencial', meetingLink: '' });
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
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
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
            <Label className="text-xs">Entrevistador *</Label>
            <Input value={form.interviewer} onChange={e => set('interviewer', e.target.value)} placeholder="Nome de quem vai entrevistar" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !canSave}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
