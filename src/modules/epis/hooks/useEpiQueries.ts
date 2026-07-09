import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';


// ===================== EPI ITEMS =====================
export function useEpiItems(filters?: { active?: boolean; category?: string }) {
  return useQuery({
    queryKey: ['epi-items', filters],
    queryFn: async () => {
      let q = supabase.from('epi_items').select('*').order('name');
      if (filters?.active !== undefined) q = q.eq('active', filters.active);
      if (filters?.category) q = q.eq('category', filters.category);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useCreateEpiItem() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (item: Record<string, any>) => {
      const { data, error } = await (supabase.from('epi_items') as any).insert(item).select().single();
      if (error) throw error;
      await supabase.from('audit_logs').insert({ user_id: user!.id, action: 'create', entity_type: 'epi_items', entity_id: data.id, details: { name: item.name } });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['epi-items'] }); toast({ title: 'EPI criado com sucesso' }); },
    onError: (e: any) => toast({ title: 'Erro ao criar EPI', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateEpiItem() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Record<string, any>) => {
      const { error } = await (supabase.from('epi_items') as any).update(updates).eq('id', id);
      if (error) throw error;
      await supabase.from('audit_logs').insert({ user_id: user!.id, action: 'update', entity_type: 'epi_items', entity_id: id, details: updates });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['epi-items'] }); toast({ title: 'EPI atualizado' }); },
    onError: (e: any) => toast({ title: 'Erro ao atualizar', description: e.message, variant: 'destructive' }),
  });
}

// ===================== COLLABORATORS =====================
export function useCollaborators(filters?: { active?: boolean; sector_id?: string }) {
  return useQuery({
    queryKey: ['collaborators', filters],
    queryFn: async () => {
      let q = supabase.from('collaborators').select('*, sector:sectors(id, name)').order('full_name');
      // New fields: email, telefone, rg, data_nascimento, endereco, observacoes are included via *
      if (filters?.active !== undefined) q = q.eq('active', filters.active);
      if (filters?.sector_id) q = q.eq('sector_id', filters.sector_id);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

/**
 * Returns a merged list: existing collaborators + profiles that don't have a collaborator record yet.
 * Profile-only entries have _isProfileOnly = true and use the profile id as a temporary key.
 */
export function useCollaboratorsWithProfiles(filters?: { active?: boolean }) {
  const { data: collaborators, ...collabRest } = useCollaborators(filters);

  return useQuery({
    queryKey: ['collaborators-with-profiles', filters, collaborators?.length],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, sector_id')
        .order('full_name');
      if (error) throw error;

      // Build set of profile IDs already linked to a collaborator
      const linkedProfileIds = new Set(
        (collaborators || [])
          .map((c: any) => c.user_profile_id)
          .filter(Boolean)
      );

      // Profiles that are NOT yet collaborators
      const profileOnly = (profiles || [])
        .filter((p: any) => !linkedProfileIds.has(p.id))
        .map((p: any) => ({
          id: `profile_${p.id}`,
          _profileId: p.id,
          _isProfileOnly: true,
          full_name: p.full_name || p.email,
          email: p.email,
          sector_id: p.sector_id || null,
          worksite: '',
          role_name: '',
          active: true,
          status: 'ativo',
        }));

      return [...(collaborators || []), ...profileOnly] as any[];
    },
    enabled: !!collaborators,
  });
}

export function useCreateCollaborator() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (item: Record<string, any>) => {
      const { data, error } = await (supabase.from('collaborators') as any).insert(item).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['collaborators'] }); toast({ title: 'Colaborador cadastrado' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}

// ===================== DELIVERIES =====================
export function useEpiDeliveries(filters?: { collaborator_id?: string; status?: string }) {
  return useQuery({
    queryKey: ['epi-deliveries', filters],
    queryFn: async () => {
      let q = supabase.from('epi_deliveries')
        .select('*, collaborator:collaborators(id, full_name, cpf, role_name, sector_id), epi_item:epi_items(id, code, name, category, ca_number, ca_valid_until, useful_life_days), delivered_by:profiles!epi_deliveries_delivered_by_user_id_fkey(id, full_name), sector:sectors(id, name)')
        .order('delivered_at', { ascending: false });
      if (filters?.collaborator_id) q = q.eq('collaborator_id', filters.collaborator_id);
      if (filters?.status) q = q.eq('current_status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useCreateDelivery() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (delivery: Record<string, any>) => {
      const payload = { ...delivery, delivered_by_user_id: user!.id };
      const { data, error } = await (supabase.from('epi_deliveries') as any).insert(payload).select().single();
      if (error) throw error;
      await supabase.from('epi_movements').insert({
        delivery_id: data.id,
        movement_type: 'delivery',
        moved_by_user_id: user!.id,
        reason: delivery.reason || 'primeira_entrega',
        notes: delivery.notes || '',
      });
      await supabase.from('audit_logs').insert({ user_id: user!.id, action: 'epi_delivery', entity_type: 'epi_deliveries', entity_id: data.id, details: { collaborator_id: delivery.collaborator_id, epi_item_id: delivery.epi_item_id } });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['epi-deliveries'] });
      qc.invalidateQueries({ queryKey: ['epi-movements'] });
      toast({ title: 'Entrega registrada com sucesso' });
    },
    onError: (e: any) => toast({ title: 'Erro na entrega', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateDeliveryStatus() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status, movement_type, condition, reason, notes }: { id: string; status: string; movement_type: string; condition?: string; reason?: string; notes?: string }) => {
      const { error: updateError } = await supabase.from('epi_deliveries').update({ current_status: status }).eq('id', id);
      if (updateError) throw updateError;
      const { error: movError } = await supabase.from('epi_movements').insert({
        delivery_id: id,
        movement_type,
        moved_by_user_id: user!.id,
        condition: condition || '',
        reason: reason || '',
        notes: notes || '',
      });
      if (movError) throw movError;
      await supabase.from('audit_logs').insert({ user_id: user!.id, action: `epi_${movement_type}`, entity_type: 'epi_deliveries', entity_id: id, details: { status, reason } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['epi-deliveries'] });
      qc.invalidateQueries({ queryKey: ['epi-movements'] });
      toast({ title: 'Status atualizado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}

// ===================== MOVEMENTS =====================
export function useEpiMovements(deliveryId?: string) {
  return useQuery({
    queryKey: ['epi-movements', deliveryId],
    enabled: !!deliveryId,
    queryFn: async () => {
      const { data, error } = await supabase.from('epi_movements')
        .select('*, moved_by:profiles!epi_movements_moved_by_user_id_fkey(id, full_name)')
        .eq('delivery_id', deliveryId!)
        .order('moved_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

// ===================== KIT RULES =====================
export function useEpiKitRules(sectorId?: string, includeInactive = false) {
  return useQuery({
    queryKey: ['epi-kit-rules', sectorId, includeInactive],
    queryFn: async () => {
      let q = supabase.from('epi_kit_rules')
        .select('*, epi_item:epi_items(id, code, name, category), sector:sectors(id, name)')
        .order('created_at');
      if (!includeInactive) q = q.eq('active', true);
      if (sectorId) q = q.eq('sector_id', sectorId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

// ===================== PENDING ITEMS =====================
export function useEpiPending() {
  return useQuery({
    queryKey: ['epi-pending'],
    queryFn: async () => {
      const { data, error } = await supabase.from('epi_deliveries')
        .select('*, collaborator:collaborators(id, full_name, sector_id, role_name), epi_item:epi_items(id, code, name, ca_number, ca_valid_until, useful_life_days)')
        .in('current_status', ['entregue', 'em_uso', 'pendente_devolucao'])
        .order('delivered_at');
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

// ===================== COLLABORATOR HISTORY =====================
export function useCollaboratorEpiHistory(collaboratorId?: string) {
  return useQuery({
    queryKey: ['epi-history', collaboratorId],
    enabled: !!collaboratorId,
    queryFn: async () => {
      const { data, error } = await supabase.from('epi_deliveries')
        .select('*, epi_item:epi_items(id, code, name, category, ca_number), delivered_by:profiles!epi_deliveries_delivered_by_user_id_fkey(id, full_name)')
        .eq('collaborator_id', collaboratorId!)
        .order('delivered_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}
