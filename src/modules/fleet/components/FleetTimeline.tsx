import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Clock, FileText, CreditCard, CheckCircle2, XCircle, RotateCcw, Send, Sparkles } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { FUEL_STATUS_LABELS } from '@/lib/constants';

interface TimelineEvent {
  id: string;
  at: string; // ISO timestamp
  kind: 'created' | 'status' | 'approval' | 'oc' | 'payment';
  title: string;
  detail?: string | null;
  actor?: string | null;
  toStatus?: string;
  fromStatus?: string | null;
  icon?: 'send' | 'oc' | 'payment' | 'approve' | 'reject' | 'return' | 'sparkles' | 'clock';
}

interface FleetTimelineProps {
  requestId: string;
  req: any;
  approvalRequest: any;
}

const APPROVAL_ICON: Record<string, TimelineEvent['icon']> = {
  approved: 'approve',
  rejected: 'reject',
  returned: 'return',
};

function renderIcon(kind: TimelineEvent['icon']) {
  const cls = 'w-3.5 h-3.5';
  switch (kind) {
    case 'send': return <Send className={cls} />;
    case 'oc': return <FileText className={cls} />;
    case 'payment': return <CreditCard className={cls} />;
    case 'approve': return <CheckCircle2 className={cls} />;
    case 'reject': return <XCircle className={cls} />;
    case 'return': return <RotateCcw className={cls} />;
    case 'sparkles': return <Sparkles className={cls} />;
    default: return <Clock className={cls} />;
  }
}

export function FleetTimeline({ requestId, req, approvalRequest }: FleetTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [historyRes, stepsRes] = await Promise.all([
        supabase
          .from('status_history')
          .select('id, from_status, to_status, changed_by, created_at, reason')
          .eq('entity_id', requestId)
          .eq('entity_type', 'fuel_requests')
          .eq('module', 'fleet')
          .order('created_at', { ascending: true }),
        approvalRequest?.id
          ? supabase
              .from('approval_request_steps')
              .select('id, step_order, status, action_at, comments, approver_user_id, profiles:approver_user_id(full_name)')
              .eq('approval_request_id', approvalRequest.id)
              .order('step_order', { ascending: true })
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const history = (historyRes.data || []) as any[];
      const steps = (stepsRes.data || []) as any[];
      const userIds = [...new Set(history.filter(h => h.changed_by).map(h => h.changed_by))];
      const profilesRes = userIds.length
        ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
        : { data: [] as any[] };
      const nameMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p.full_name]));

      const all: TimelineEvent[] = [];

      // Creation
      if (req?.created_at) {
        all.push({
          id: `created-${requestId}`,
          at: req.created_at,
          kind: 'created',
          title: 'Solicitação criada',
          actor: req.profiles?.full_name || null,
          icon: 'sparkles',
        });
      }

      // Status transitions
      for (const h of history) {
        let icon: TimelineEvent['icon'] = 'clock';
        if (h.to_status === 'enviado') icon = 'send';
        else if (h.to_status === 'aguardando_oc') icon = 'oc';
        else if (h.to_status === 'aguardando_pagamento') icon = 'oc';
        else if (h.to_status === 'pago') icon = 'payment';
        else if (h.to_status === 'concluido' || h.to_status === 'aprovado') icon = 'approve';
        else if (h.to_status === 'reprovado') icon = 'reject';
        else if (h.to_status === 'retornado') icon = 'return';

        all.push({
          id: `h-${h.id}`,
          at: h.created_at,
          kind: 'status',
          title: FUEL_STATUS_LABELS[h.to_status] || h.to_status,
          fromStatus: h.from_status,
          toStatus: h.to_status,
          detail: h.reason,
          actor: h.changed_by ? nameMap.get(h.changed_by) || 'Sistema' : 'Sistema',
          icon,
        });
      }

      // Approval step actions (only acted ones)
      for (const s of steps) {
        if (!s.action_at || s.status === 'pending') continue;
        all.push({
          id: `s-${s.id}`,
          at: s.action_at,
          kind: 'approval',
          title: `Etapa ${s.step_order} · ${s.status === 'approved' ? 'Aprovada' : s.status === 'rejected' ? 'Recusada' : s.status === 'returned' ? 'Devolvida' : s.status}`,
          detail: s.comments,
          actor: s.profiles?.full_name || 'Aprovador',
          icon: APPROVAL_ICON[s.status] || 'clock',
        });
      }

      // OC + payment markers from req itself (defensive: status_history above usually covers these)
      if (req?.oc_number) {
        const hasOcEvent = history.some(h => h.to_status === 'aguardando_oc' || h.to_status === 'aguardando_pagamento');
        if (!hasOcEvent) {
          all.push({
            id: `oc-${requestId}`,
            at: req.updated_at || req.created_at,
            kind: 'oc',
            title: `OC registrada: ${req.oc_number}`,
            detail: req.oc_notes,
            icon: 'oc',
          });
        }
      }
      if (req?.paid_at) {
        all.push({
          id: `paid-${requestId}`,
          at: req.paid_at,
          kind: 'payment',
          title: 'Pagamento confirmado',
          detail: req.payment_notes,
          icon: 'payment',
        });
      }

      all.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      if (mounted) {
        setEvents(all);
        setLoading(false);
      }
    };
    load();

    const channel = supabase
      .channel(`fleet-timeline-${requestId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'status_history', filter: `entity_id=eq.${requestId}`,
      }, () => load())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [requestId, approvalRequest?.id, req?.oc_number, req?.paid_at]);

  if (loading) {
    return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Nenhum evento registrado ainda</p>;
  }

  return (
    <div className="space-y-0">
      {events.map((e, idx) => (
        <div key={e.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
              e.kind === 'approval' ? 'bg-primary/10 text-primary' :
              e.kind === 'oc' ? 'bg-amber-100 text-amber-700' :
              e.kind === 'payment' ? 'bg-emerald-100 text-emerald-700' :
              e.kind === 'created' ? 'bg-blue-100 text-blue-700' :
              'bg-muted text-muted-foreground'
            }`}>{renderIcon(e.icon)}</div>
            {idx < events.length - 1 && <div className="w-px flex-1 bg-border min-h-[24px]" />}
          </div>
          <div className="pb-4 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {e.kind === 'status' && e.toStatus ? (
                <StatusBadge status={e.toStatus} label={FUEL_STATUS_LABELS[e.toStatus] || e.toStatus} />
              ) : (
                <span className="text-sm font-medium text-foreground">{e.title}</span>
              )}
              {e.fromStatus && (
                <span className="text-xs text-muted-foreground">← {FUEL_STATUS_LABELS[e.fromStatus] || e.fromStatus}</span>
              )}
            </div>
            {e.detail && (
              <p className="text-xs text-muted-foreground mt-1 italic line-clamp-3">"{e.detail}"</p>
            )}
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {new Date(e.at).toLocaleString('pt-BR')}
              {e.actor && <span>· {e.actor}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}