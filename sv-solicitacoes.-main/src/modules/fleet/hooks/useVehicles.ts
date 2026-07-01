import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

export interface Vehicle {
  id: string;
  placa: string;
  modelo: string;
  km: number;
  status: 'ativo' | 'inativo' | 'manutencao';
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export function useVehicles(options?: { onlyActive?: boolean }) {
  const qc = useQueryClient();

  // Realtime sync
  useEffect(() => {
    const ch = supabase
      .channel('vehicles-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => {
        qc.invalidateQueries({ queryKey: ['vehicles'] });
        qc.invalidateQueries({ queryKey: ['vehicles_active'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return useQuery<Vehicle[]>({
    queryKey: options?.onlyActive ? ['vehicles_active'] : ['vehicles'],
    queryFn: async () => {
      let q = (supabase as any).from('vehicles').select('*').order('placa', { ascending: true });
      if (options?.onlyActive) q = q.eq('status', 'ativo');
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Vehicle[];
    },
  });
}

export function useUpsertVehicle() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: Partial<Vehicle> & { placa: string; modelo: string }) => {
      const payload = {
        ...input,
        placa: input.placa.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      };
      if (input.id) {
        const { error } = await (supabase as any).from('vehicles').update(payload).eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('vehicles').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['vehicles_active'] });
      toast({ title: 'Veículo salvo!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao salvar veículo', description: err.message, variant: 'destructive' });
    },
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('vehicles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['vehicles_active'] });
      toast({ title: 'Veículo removido' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao remover', description: err.message, variant: 'destructive' });
    },
  });
}

/** Map of placa -> Vehicle for quick lookup */
export function useVehicleByPlate(placa?: string | null) {
  const { data } = useVehicles();
  if (!placa || !data) return null;
  const target = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return data.find(v => v.placa === target) || null;
}