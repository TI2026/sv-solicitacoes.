import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only service-role callers (edge triggers / cron / internal RPCs) may inject notifications.
    // The anon/publishable key is public — never accept it as auth here.
    const authHeader = req.headers.get('Authorization');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { user_ids, subject, body, metadata, idempotency_key } = await req.json();

    if (!Array.isArray(user_ids) || user_ids.length === 0 || !subject || !body) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Idempotency check
    if (idempotency_key) {
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('metadata->>idempotency_key', idempotency_key)
        .limit(1);
      if (existing && existing.length > 0) {
        console.log('Duplicate notification skipped:', idempotency_key);
        return new Response(JSON.stringify({ skipped: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Create in-app notifications
    const notifications = (user_ids as string[]).map(uid => ({
      user_id: uid,
      title: subject,
      message: body,
      channel: 'in_app',
      metadata: { ...metadata, idempotency_key },
    }));

    const { error } = await supabase.from('notifications').insert(notifications);
    if (error) {
      console.error('Insert error:', error);
      throw error;
    }

    // Email placeholder: integrate with provider here
    console.log(`Notifications sent to ${user_ids.length} users: ${subject}`);

    return new Response(JSON.stringify({ success: true, count: user_ids.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
