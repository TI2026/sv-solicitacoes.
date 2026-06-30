import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
