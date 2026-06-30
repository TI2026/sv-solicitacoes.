import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // [P0-04] Correção: Blindagem de Edge Functions (Cron/Service) — IP-PLAN Onda 3
    const authHeader = req.headers.get('Authorization');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (authHeader !== `Bearer ${serviceKey}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    // 1. Find EPI items with CA expiring within 90 days
    const { data: expiringItems } = await supabase
      .from('epi_items')
      .select('id, name, ca_number, ca_valid_until')
      .eq('active', true)
      .not('ca_valid_until', 'is', null)
      .lte('ca_valid_until', in90Days.toISOString().split('T')[0]);

    // 2. Find deliveries with pending return
    const { data: pendingReturns } = await supabase
      .from('epi_deliveries')
      .select('id, collaborator_id, epi_item_id, delivered_at, collaborator:collaborators(full_name, sector_id), epi_item:epi_items(name, useful_life_days)')
      .eq('current_status', 'pendente_devolucao');

    // 3. Find deliveries with expired useful life
    const { data: activeDeliveries } = await supabase
      .from('epi_deliveries')
      .select('id, collaborator_id, epi_item_id, delivered_at, delivered_by_user_id, collaborator:collaborators(full_name), epi_item:epi_items(name, useful_life_days)')
      .in('current_status', ['entregue', 'em_uso']);

    const expiredLifeDeliveries = (activeDeliveries || []).filter((d: any) => {
      const days = d.epi_item?.useful_life_days;
      if (!days) return false;
      const expiresAt = new Date(new Date(d.delivered_at).getTime() + days * 24 * 60 * 60 * 1000);
      return expiresAt < now;
    });

    // 4. Get admin/RH users to notify
    const { data: adminUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['diretoria', 'administrativo', 'rh']);

    const adminIds = [...new Set((adminUsers || []).map((u: any) => u.user_id))];

    const notifications: any[] = [];

    // CA expiring notifications
    if (expiringItems && expiringItems.length > 0) {
      const itemNames = expiringItems.slice(0, 5).map((i: any) => i.name).join(', ');
      for (const uid of adminIds) {
        notifications.push({
          user_id: uid,
          title: 'EPIs com CA vencendo',
          message: `${expiringItems.length} item(ns) com CA vencendo em até 90 dias: ${itemNames}`,
          metadata: { entity_type: 'epi_items', alert_type: 'ca_expiring', count: expiringItems.length },
        });
      }
    }

    // Pending return notifications
    if (pendingReturns && pendingReturns.length > 0) {
      for (const uid of adminIds) {
        notifications.push({
          user_id: uid,
          title: 'EPIs pendentes de devolução',
          message: `${pendingReturns.length} EPI(s) aguardando devolução`,
          metadata: { entity_type: 'epi_deliveries', alert_type: 'pending_return', count: pendingReturns.length },
        });
      }
    }

    // Expired useful life notifications
    if (expiredLifeDeliveries.length > 0) {
      for (const uid of adminIds) {
        notifications.push({
          user_id: uid,
          title: 'EPIs com vida útil expirada',
          message: `${expiredLifeDeliveries.length} EPI(s) com vida útil vencida em uso`,
          metadata: { entity_type: 'epi_deliveries', alert_type: 'expired_useful_life', count: expiredLifeDeliveries.length },
        });
      }
    }

    // Insert all notifications
    if (notifications.length > 0) {
      const { error } = await supabase.from('notifications').insert(notifications);
      if (error) console.error('Error inserting notifications:', error);
    }

    return new Response(JSON.stringify({
      success: true,
      ca_expiring: expiringItems?.length || 0,
      pending_returns: pendingReturns?.length || 0,
      expired_useful_life: expiredLifeDeliveries.length,
      notifications_sent: notifications.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
