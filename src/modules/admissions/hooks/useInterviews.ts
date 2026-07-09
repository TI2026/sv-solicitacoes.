import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useAdmissionInterviews(admissionId: string) {
  return useQuery({
    queryKey: ['admission_interviews', admissionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admission_interviews')
        .select('*, profiles:conducted_by(full_name)')
        .eq('admission_request_id', admissionId)
        .order('scheduled_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!admissionId,
  });
}

export function useCreateAdmissionInterview() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      admission_request_id: string;
      candidate_id: string;
      scheduled_at: string;
      conducted_by: string;
      interview_mode?: string;
      interview_address?: string;
      interview_city?: string;
      meeting_link?: string;
      result?: string;
      notes?: string;
    }) => {
      const { data: result, error } = await supabase
        .from('admission_interviews')
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admission_interviews', vars.admission_request_id] });
      toast({ title: 'Entrevista registrada!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUpdateAdmissionInterview() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, admissionId, data }: { id: string; admissionId: string; data: Record<string, any> }) => {
      const { error } = await supabase
        .from('admission_interviews') as any
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admission_interviews', vars.admissionId] });
      toast({ title: 'Entrevista atualizada!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}

export function useInterviewConductors() {
  return useQuery({
    queryKey: ['interview_conductors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_role_assignments')
        .select('user_id, roles(key, is_master)');
      if (error) throw error;

      const rhAdminUserIds = [...new Set(
        (data || [])
          .filter((a: any) => {
            const key = a.roles?.key;
            const isMaster = !!a.roles?.is_master;
            return isMaster || key === 'rh' || key === 'administrativo' || key === 'diretoria';
          })
          .map((a: any) => a.user_id)
      )];

      if (rhAdminUserIds.length === 0) return [];

      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', rhAdminUserIds)
        .order('full_name');
      if (pErr) throw pErr;
      return profiles || [];
    },
  });
}
