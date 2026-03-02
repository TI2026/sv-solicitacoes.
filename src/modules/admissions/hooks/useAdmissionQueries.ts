import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useAdmissionRequests() {
  return useQuery({
    queryKey: ['admission_requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admission_requests')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useAdmissionRequest(id: string) {
  return useQuery({
    queryKey: ['admission_request', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admission_requests')
        .select('*, profiles(full_name)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

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
        .select('*, admission_requests(id, cargo_funcao, status)')
        .eq('id', candidateId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!candidateId,
  });
}

export function useCandidateDocuments(candidateId: string) {
  return useQuery({
    queryKey: ['candidate_documents', candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_documents')
        .select('*, documents(key, label, required)')
        .eq('candidate_id', candidateId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!candidateId,
  });
}

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const { data, error } = await supabase.from('documents').select('*').order('label');
      if (error) throw error;
      return data || [];
    },
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

export function useCreateAdmission() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: any) => {
      const { data: result, error } = await supabase
        .from('admission_requests')
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admission_requests'] });
      qc.invalidateQueries({ queryKey: ['admission_metrics'] });
      toast({ title: 'Solicitação de admissão criada!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}

export function useAdmissionSetStatus() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { requestId: string; toStatus: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('admission_set_status', {
        _request_id: params.requestId,
        _to_status: params.toStatus as any,
        _reason: params.reason || null,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admission_requests'] });
      qc.invalidateQueries({ queryKey: ['admission_request'] });
      qc.invalidateQueries({ queryKey: ['admission_metrics'] });
      qc.invalidateQueries({ queryKey: ['status_history'] });
      toast({ title: 'Status atualizado!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
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

export function useGenerateToken() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (candidateId: string) => {
      const { data, error } = await supabase.rpc('generate_candidate_token', {
        _candidate_id: candidateId,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast({ title: 'Token gerado com sucesso!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}
