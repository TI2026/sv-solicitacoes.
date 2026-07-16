import { supabase } from '@/integrations/supabase/client';

export interface PurchaseAttachment {
  id: string;
  name: string;
  path: string;
  uploaded_at: string;
}

export interface PurchaseRequest {
  id: string;
  requester_user_id: string;
  supplier: string | null;
  category: string;
  description: string;
  justification: string | null;
  cost_center: string | null;
  priority: string;
  estimated_value: number;
  approved_value: number | null;
  purchase_number: string | null;
  status: string;
  approval_request_id: string | null;
  attachments: PurchaseAttachment[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseFilters {
  status?: string;
  requester_user_id?: string;
  category?: string;
  priority?: string;
  supplier?: string;
  startDate?: string;
  endDate?: string;
}

export async function loadPurchases(filters?: PurchaseFilters): Promise<PurchaseRequest[]> {
  let query = supabase
    .from('purchases')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters) {
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.requester_user_id) query = query.eq('requester_user_id', filters.requester_user_id);
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.priority) query = query.eq('priority', filters.priority);
    if (filters.supplier) query = query.ilike('supplier', `%${filters.supplier}%`);
    if (filters.startDate) query = query.gte('created_at', filters.startDate);
    if (filters.endDate) query = query.lte('created_at', filters.endDate);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error('Error loading purchases:', error);
    throw error;
  }
  
  return data as PurchaseRequest[];
}

export async function loadPurchase(id: string): Promise<PurchaseRequest> {
  const { data, error } = await supabase
    .from('purchases')
    .select('*')
    .eq('id', id)
    .single();
    
  if (error) {
    console.error('Error loading purchase:', error);
    throw error;
  }
  
  return data as PurchaseRequest;
}
