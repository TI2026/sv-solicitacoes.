import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { useToast } from './use-toast';

interface DynamicCategory {
  id: string;
  module: string;
  field_key: string;
  label: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export function useDynamicCategories(module: string, fieldKey: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['dynamic_categories', module, fieldKey];

  useRealtimeSubscription({
    channelName: `categories-${module}-${fieldKey}`,
    enabled: true,
    tables: [{ table: 'dynamic_categories', queryKeys: [queryKey] }],
  });

  const { data: categories = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dynamic_categories')
        .select('*')
        .eq('module', module)
        .eq('field_key', fieldKey)
        .eq('is_active', true)
        .order('label');
      if (error) throw error;
      return (data || []) as DynamicCategory[];
    },
  });

  const addCategory = useMutation({
    mutationFn: async (label: string) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from('dynamic_categories').insert({
        module,
        field_key: fieldKey,
        label: label.trim(),
        created_by: user?.id || null,
      });
      if (error) {
        if (error.code === '23505') throw new Error('Categoria já existe');
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: 'Categoria adicionada!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const removeCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('dynamic_categories')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: 'Categoria removida!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  return {
    categories,
    isLoading,
    addCategory: addCategory.mutateAsync,
    removeCategory: removeCategory.mutateAsync,
    isAdding: addCategory.isPending,
    isRemoving: removeCategory.isPending,
  };
}
