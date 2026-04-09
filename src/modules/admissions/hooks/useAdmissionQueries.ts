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
      qc.invalidateQueries({ queryKey: ['adm_all'] });
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
    mutationFn: async (params: { requestId: string; toStatus: string; reason?: string; startApproval?: { requesterUserId: string } }) => {
      const { data, error } = await supabase.rpc('admission_set_status', {
        _request_id: params.requestId,
        _to_status: params.toStatus as any,
        _reason: params.reason || null,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);

      // Try to start approval flow when entering triagem
      if (params.toStatus === 'aguardando_triagem' && params.startApproval) {
        try {
          const { data: flowResult } = await supabase.rpc('start_approval_flow', {
            p_module_code: 'admissao',
            p_reference_id: params.requestId,
            p_requester_user_id: params.startApproval.requesterUserId,
          });
          if (flowResult && !(flowResult as any).error) {
            console.log('Admission approval flow started:', flowResult);
          }
        } catch (e) {
          console.warn('Admission approval flow not started:', e);
        }
      }

      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admission_requests'] });
      qc.invalidateQueries({ queryKey: ['admission_request'] });
      qc.invalidateQueries({ queryKey: ['admission_metrics'] });
      qc.invalidateQueries({ queryKey: ['adm_all'] });
      qc.invalidateQueries({ queryKey: ['status_history'] });
      qc.invalidateQueries({ queryKey: ['approval_request_for'] });
      qc.invalidateQueries({ queryKey: ['my_approvals'] });
      qc.invalidateQueries({ queryKey: ['all_approval_requests'] });
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

// ===== WebCrypto-based token generation for public links =====
async function generateSecureToken(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .split('+').join('-')
    .split('/').join('_')
    .split('=').join('');
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function useAdmissionPublicLinks(admissionId: string, linkType: 'DOCUMENTS' | 'SIGNATURE') {
  return useQuery({
    queryKey: ['admission_public_links', admissionId, linkType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admission_public_links')
        .select('*')
        .eq('admission_request_id', admissionId)
        .eq('link_type', linkType)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString());
      if (error) throw error;
      return data || [];
    },
    enabled: !!admissionId,
  });
}

export function useGeneratePublicLink() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      admissionRequestId: string;
      candidateId: string;
      linkType: 'DOCUMENTS' | 'SIGNATURE';
    }) => {
      // Check if valid link already exists
      const { data: existing } = await supabase
        .from('admission_public_links')
        .select('id, token_hash')
        .eq('admission_request_id', params.admissionRequestId)
        .eq('candidate_id', params.candidateId)
        .eq('link_type', params.linkType)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (existing) {
        // Link already exists and is valid - we can't recover the token from hash
        // so we need to regenerate
        // Actually, return a flag that link exists
        return { alreadyExists: true, id: existing.id };
      }

      // Generate token via WebCrypto (NO gen_random_bytes)
      const token = await generateSecureToken();
      const tokenHash = await sha256(token);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from('admission_public_links')
        .insert({
          admission_request_id: params.admissionRequestId,
          candidate_id: params.candidateId,
          link_type: params.linkType,
          token_hash: tokenHash,
          expires_at: expiresAt,
        });

      if (error) throw error;

      return { token, linkType: params.linkType };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admission_public_links', vars.admissionRequestId, vars.linkType] });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao gerar link', description: err.message, variant: 'destructive' });
    },
  });
}

export function useAdmissionFiles(admissionId: string, linkType: 'DOCUMENTS' | 'SIGNATURE' | 'EXAM') {
  return useQuery({
    queryKey: ['admission_files', admissionId, linkType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admission_files')
        .select('*')
        .eq('admission_request_id', admissionId)
        .eq('link_type', linkType)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!admissionId,
  });
}

export function useFinalizeLink() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      admissionRequestId: string;
      candidateId: string;
      linkType: 'DOCUMENTS' | 'SIGNATURE';
    }) => {
      // Mark the link as used
      const { error } = await supabase
        .from('admission_public_links')
        .update({
          candidate_uploaded_at: new Date().toISOString(),
          used_at: new Date().toISOString(),
        })
        .eq('admission_request_id', params.admissionRequestId)
        .eq('candidate_id', params.candidateId)
        .eq('link_type', params.linkType)
        .is('used_at', null);

      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admission_public_links', vars.admissionRequestId, vars.linkType] });
      toast({ title: 'Link finalizado!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}

// Keep old useGenerateToken for backward compatibility but it now uses WebCrypto
export function useGenerateToken() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (candidateId: string) => {
      // Generate token via WebCrypto instead of RPC
      const token = await generateSecureToken();
      const tokenHash = await sha256(token);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      // Invalidate old tokens
      await supabase
        .from('public_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('candidate_id', candidateId)
        .is('used_at', null);

      // Insert new token
      const { error } = await supabase
        .from('public_tokens')
        .insert({
          candidate_id: candidateId,
          token_hash: tokenHash,
          expires_at: expiresAt,
        });

      if (error) throw error;
      return { token, expires_in_days: 7 };
    },
    onSuccess: () => {
      toast({ title: 'Token gerado com sucesso!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}

// ===== Admission Interviews =====

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
        .from('admission_interviews')
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
      // Get users with RH or Administrativo roles
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role');
      if (error) throw error;

      const rhAdminUserIds = [...new Set(
        (data || [])
          .filter(r => r.role === 'rh' || r.role === 'administrativo' || r.role === 'diretoria')
          .map(r => r.user_id)
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
