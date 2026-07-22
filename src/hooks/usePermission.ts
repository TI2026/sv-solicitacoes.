import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook oficial de verificação de permissão (Sprint 13.9 — Frente 4.2).
 *
 * Consulta a matriz oficial via RPC `current_user_has_permission`.
 * Se a RPC falhar (rede/erro), aplica fallback conservador para `hasRole`
 * usando o AuthContext — mantém compatibilidade enquanto os hotspots
 * migram gradualmente na Sprint 14.
 *
 * NÃO substitui os `hasRole()` existentes automaticamente. A adoção deve
 * ser feita tela a tela, com validação funcional.
 */
export function usePermission(moduleCode: string, actionCode: string) {
  const { user, hasRole } = useAuth() as {
    user: { id: string } | null;
    hasRole: (role: string) => boolean;
  };

  const query = useQuery({
    queryKey: ['permission', user?.id, moduleCode, actionCode],
    enabled: !!user?.id && !!moduleCode && !!actionCode,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('current_user_has_permission', {
        p_module_code: moduleCode,
        p_action_code: actionCode,
      });
      if (error) throw error;
      return Boolean(data);
    },
  });

  // Fallback conservador: Master/Diretoria sempre têm acesso enquanto a RPC
  // não responde ou falha. Evita telas em branco em caso de indisponibilidade.
  const roleFallback = hasRole?.('master') || hasRole?.('diretoria') || false;

  return {
    allowed: query.data ?? (query.isError ? roleFallback : false),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export default usePermission;