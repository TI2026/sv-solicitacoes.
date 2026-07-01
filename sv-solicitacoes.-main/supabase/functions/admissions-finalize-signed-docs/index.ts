import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = getClientIp(req);

  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: 'Muitas tentativas.' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenHash = await hashToken(token);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Try admission_public_links first (new system)
    const { data: link } = await supabase
      .from('admission_public_links')
      .select('id, candidate_id, link_type, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (link) {
      if (link.used_at || new Date(link.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Mark as used
      await supabase.from('admission_public_links').update({
        used_at: new Date().toISOString(),
        candidate_uploaded_at: new Date().toISOString(),
      }).eq('id', link.id);

      // Log
      await supabase.from('audit_logs').insert({
        action: 'finalize_public_link',
        entity_type: 'candidates',
        entity_id: link.candidate_id,
        details: { ip: clientIp, link_type: link.link_type, finalized_at: new Date().toISOString() },
      });

      console.log(`Public link finalized from IP ${clientIp} for candidate ${link.candidate_id}, type ${link.link_type}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fallback: try old public_tokens table
    const { data: tokenRow } = await supabase
      .from('public_tokens')
      .select('id, candidate_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase.from('public_tokens').update({ used_at: new Date().toISOString() }).eq('id', tokenRow.id);

    await supabase.from('audit_logs').insert({
      action: 'finalize_signed_docs',
      entity_type: 'candidates',
      entity_id: tokenRow.candidate_id,
      details: { ip: clientIp, finalized_at: new Date().toISOString() },
    });

    console.log(`Signed docs finalized from IP ${clientIp} for candidate ${tokenRow.candidate_id}`);

    return new Response(JSON.stringify({ success: true }), {
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
