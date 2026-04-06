import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const from = (table: string) => (supabase as any).from(table);

/**
 * Creates a collaborator from admission data (concluded admissions).
 * Links back to the admission_request and candidate profile.
 */
export function useCreateCollaboratorFromAdmission() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      full_name: string;
      cpf?: string | null;
      sector_id?: string | null;
      role_name?: string;
      worksite?: string;
      admission_request_id?: string;
      user_profile_id?: string | null;
      shirt_size?: string | null;
      pants_size?: string | null;
      shoe_size?: string | null;
    }) => {
      // Check if collaborator already exists for this admission
      if (params.admission_request_id) {
        const { data: existing } = await from('collaborators')
          .select('id')
          .eq('admission_request_id', params.admission_request_id)
          .maybeSingle();
        if (existing) {
          return existing;
        }
      }

      // Check by CPF if provided
      if (params.cpf) {
        const normalized = params.cpf.replace(/\D/g, '');
        if (normalized.length === 11) {
          const { data: existingCpf } = await from('collaborators')
            .select('id')
            .eq('cpf', normalized)
            .eq('active', true)
            .maybeSingle();
          if (existingCpf) {
            // Update link to admission
            if (params.admission_request_id) {
              await from('collaborators')
                .update({ admission_request_id: params.admission_request_id })
                .eq('id', existingCpf.id);
            }
            return existingCpf;
          }
        }
      }

      const { data, error } = await from('collaborators').insert({
        full_name: params.full_name,
        cpf: params.cpf?.replace(/\D/g, '') || null,
        sector_id: params.sector_id || null,
        role_name: params.role_name || '',
        worksite: params.worksite || '',
        admission_request_id: params.admission_request_id || null,
        user_profile_id: params.user_profile_id || null,
        status: 'ativo',
        active: true,
      }).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collaborators'] });
      toast({ title: 'Colaborador criado a partir da admissão' });
    },
    onError: (e: any) => {
      toast({ title: 'Erro ao criar colaborador', description: e.message, variant: 'destructive' });
    },
  });
}
