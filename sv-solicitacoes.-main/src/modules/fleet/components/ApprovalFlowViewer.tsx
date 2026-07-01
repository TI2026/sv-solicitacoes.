import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, XCircle, RotateCcw, Clock } from 'lucide-react';

interface Step {
  id: string;
  step_order: number;
  status: string;
  action_at: string | null;
  comments: string | null;
  approver_user_id: string | null;
  profiles?: { full_name: string | null } | null;
}

export function ApprovalFlowViewer({ approvalRequestId }: { approvalRequestId: string }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from('approval_request_steps')
        .select('id, step_order, status, action_at, comments, approver_user_id, profiles:approver_user_id(full_name)')
        .eq('approval_request_id', approvalRequestId)
        .order('step_order', { ascending: true });
      if (mounted) {
        setSteps((data as any) || []);
        setLoading(false);
      }
    };
    load();
    const channel = supabase
      .channel(`approval-flow-${approvalRequestId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'approval_request_steps',
        filter: `approval_request_id=eq.${approvalRequestId}`,
      }, () => load())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [approvalRequestId]);

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (steps.length === 0) return <p className="text-sm text-muted-foreground py-2 text-center">Nenhuma etapa configurada</p>;

  return (
    <div className="space-y-2">
      {steps.map((s) => {
        const icon = s.status === 'approved' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          : s.status === 'rejected' ? <XCircle className="w-4 h-4 text-destructive" />
          : s.status === 'returned' ? <RotateCcw className="w-4 h-4 text-amber-600" />
          : <Clock className="w-4 h-4 text-muted-foreground" />;
        const label = s.status === 'approved' ? 'Aprovada'
          : s.status === 'rejected' ? 'Recusada'
          : s.status === 'returned' ? 'Devolvida'
          : 'Pendente';
        return (
          <div key={s.id} className="flex items-start gap-3 p-2 rounded-md border bg-card">
            <div className="mt-0.5">{icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="font-medium">Etapa {s.step_order}</span>
                <span className="text-muted-foreground">·</span>
                <span>{label}</span>
                {s.profiles?.full_name && <span className="text-muted-foreground">· {s.profiles.full_name}</span>}
              </div>
              {s.comments && <p className="text-xs text-muted-foreground mt-1 italic">"{s.comments}"</p>}
              {s.action_at && <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(s.action_at).toLocaleString('pt-BR')}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}