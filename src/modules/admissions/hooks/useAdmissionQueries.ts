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

export * from './useCandidates';
export * from './useDocuments';
export * from './useInterviews';
