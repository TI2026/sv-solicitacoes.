import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useUserEffectivePermissions(userId?: string) {
  return useQuery({
    queryKey: ['user_effective_permissions', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_effective_permissions')
        .select('*, permission_modules(code, name), permission_actions(code, name)')
        .eq('user_id', userId!)
        .eq('allowed', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}
