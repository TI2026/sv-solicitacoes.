import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface RequestLimit {
  id: string;
  role: string;
  request_type: string;
  daily_limit: number;
  created_at: string;
  updated_at: string;
}

export function useRequestLimits() {
  return useQuery({
    queryKey: ['request_limits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('request_limits')
        .select('*')
        .order('role', { ascending: true });
      if (error) throw error;
      return (data || []) as RequestLimit[];
    },
  });
}

export function useDailyLimitForRole(roles: string[] | undefined, requestType: string) {
  const { data: limits } = useRequestLimits();

  if (!limits || !roles?.length) return null;

  // Find the most permissive (highest) limit among user's roles
  let maxLimit = -1;
  for (const role of roles) {
    const match = limits.find(l => l.role === role && l.request_type === requestType);
    if (match && match.daily_limit > maxLimit) {
      maxLimit = match.daily_limit;
    }
  }

  return maxLimit >= 0 ? maxLimit : null;
}

export function useUpsertRequestLimit() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { id?: string; role: string; request_type: string; daily_limit: number }) => {
      if (data.id) {
        const { error } = await supabase
          .from('request_limits')
          .update({ daily_limit: data.daily_limit, role: data.role, request_type: data.request_type })
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('request_limits')
          .upsert({ role: data.role, request_type: data.request_type, daily_limit: data.daily_limit }, { onConflict: 'role,request_type' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['request_limits'] });
      toast({ title: 'Limite atualizado!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}

export function useDeleteRequestLimit() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('request_limits').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['request_limits'] });
      toast({ title: 'Limite removido' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}
