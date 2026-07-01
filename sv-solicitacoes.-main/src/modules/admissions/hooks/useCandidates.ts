import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useCandidates(admissionId: string) {
  return useQuery({
    queryKey: ['candidates', admissionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .eq('admission_request_id', admissionId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!admissionId,
  });
}

export function useCandidate(candidateId: string) {
  return useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidates')
        .select('*, admission_requests(id, cargo_funcao, status, centro_custo)')
        .eq('id', candidateId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!candidateId,
  });
}

export function useMedicalExam(candidateId: string) {
  return useQuery({
    queryKey: ['medical_exam', candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medical_exams')
        .select('*, clinics(nome)')
        .eq('candidate_id', candidateId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!candidateId,
  });
}

export function useSystemRegistration(candidateId: string) {
  return useQuery({
    queryKey: ['system_registration', candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_registrations')
        .select('*')
        .eq('candidate_id', candidateId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!candidateId,
  });
}

export function useClinics() {
  return useQuery({
    queryKey: ['clinics'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clinics').select('*').eq('active', true).order('nome');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateCandidate() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: any) => {
      const { data: result, error } = await supabase
        .from('candidates')
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates'] });
      toast({ title: 'Candidato cadastrado!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUpdateCandidate() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { data: result, error } = await supabase
        .from('candidates')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates'] });
      qc.invalidateQueries({ queryKey: ['candidate'] });
      toast({ title: 'Candidato atualizado!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}
