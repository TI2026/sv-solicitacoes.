import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Collaborator {
  id: string;
  full_name: string;
  matricula: string | null;
  cpf: string | null;
  job_title: string | null;
  sector_id: string | null;
  active: boolean;
  sector?: { id: string; name: string } | null;
  [key: string]: any;
}

export function useCollaborators(filters?: { active?: boolean; sector_id?: string; includeProfiles?: boolean }) {
  return useQuery({
    queryKey: ['collaborators', filters],
    queryFn: async () => {
      let q = supabase.from('collaborators').select('*, sector:sectors(id, name)').order('full_name');
      if (filters?.active !== undefined) q = q.eq('active', filters.active);
      if (filters?.sector_id) q = q.eq('sector_id', filters.sector_id);
      const { data: collabs, error } = await q;
      if (error) throw error;
      
      let finalData = (collabs || []) as unknown as Collaborator[];

      if (filters?.includeProfiles) {
        const { data: profiles, error: profError } = await supabase
          .from('profiles')
          .select('id, full_name, email, sector_id')
          .order('full_name');
        
        if (!profError && profiles) {
          const linkedProfileIds = new Set(finalData.map(c => c.user_profile_id).filter(Boolean));
          const profileOnly = profiles
            .filter(p => !linkedProfileIds.has(p.id))
            .map(p => ({
              id: `profile_${p.id}`,
              _profileId: p.id,
              _isProfileOnly: true,
              full_name: p.full_name || p.email,
              email: p.email,
              sector_id: p.sector_id || null,
              active: true,
              matricula: null,
              cpf: null,
              job_title: null,
              role_name: '(Perfil do Sistema)'
            } as any));
            
          finalData = [...finalData, ...profileOnly];
        }
      }

      return finalData;
    },
  });
}
