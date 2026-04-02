import { supabase } from '@/integrations/supabase/client';

/**
 * Assigns the sector responsible as reviewer for a fuel request.
 * Does NOT replace the approval flow — this is an operational assignment.
 */
export async function assignReviewerByRequesterSector(
  requestId: string,
  requesterUserId: string
): Promise<string | null> {
  try {
    // 1. Get requester's sector_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('sector_id')
      .eq('id', requesterUserId)
      .single();

    if (!profile?.sector_id) {
      console.info('[assignReviewer] Requester has no sector, skipping assignment');
      return null;
    }

    // 2. Get sector responsible
    const { data: sector } = await supabase
      .from('sectors')
      .select('responsible_user_id')
      .eq('id', profile.sector_id)
      .eq('active', true)
      .single();

    if (!sector?.responsible_user_id) {
      console.info('[assignReviewer] Sector has no responsible, skipping assignment');
      return null;
    }

    // 3. Update fuel_requests.assigned_to_user_id
    const { error } = await supabase
      .from('fuel_requests')
      .update({ assigned_to_user_id: sector.responsible_user_id } as any)
      .eq('id', requestId);

    if (error) {
      console.error('[assignReviewer] Failed to assign:', error.message);
      return null;
    }

    return sector.responsible_user_id;
  } catch (err: any) {
    console.error('[assignReviewer] Error:', err.message);
    return null;
  }
}
