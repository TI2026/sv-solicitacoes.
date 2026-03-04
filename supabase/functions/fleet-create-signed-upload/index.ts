import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user with anon client
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Parse request
    const { fuel_request_id, file_type, file_name, file_size, attachment_type } = await req.json();

    if (!fuel_request_id || !file_type || !file_name || !file_size || !attachment_type) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios ausentes' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file_type)) {
      return new Response(JSON.stringify({ error: 'Tipo de arquivo não permitido. Use JPEG, PNG ou PDF.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate file size
    if (file_size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: 'Arquivo excede o limite de 10MB.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate attachment_type
    if (!['hodometro', 'nota_fiscal'].includes(attachment_type)) {
      return new Response(JSON.stringify({ error: 'Tipo de anexo inválido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role to verify ownership
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: fuelReq, error: fuelError } = await adminClient
      .from('fuel_requests')
      .select('id, requester_user_id')
      .eq('id', fuel_request_id)
      .maybeSingle();

    if (fuelError || !fuelReq) {
      return new Response(JSON.stringify({ error: 'Solicitação não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check ownership or admin role
    const { data: roles } = await adminClient.rpc('get_user_roles', { _user_id: userId });
    const isAdmin = (roles || []).some((r: string) => ['diretoria', 'administrativo'].includes(r));

    if (fuelReq.requester_user_id !== userId && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Sem permissão para este upload' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sanitize filename
    const sanitized = file_name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    const path = `requests/${fuel_request_id}/${attachment_type}/${Date.now()}_${sanitized}`;

    // Create signed upload URL
    const { data: signedData, error: signedError } = await adminClient.storage
      .from('fleet')
      .createSignedUploadUrl(path);

    if (signedError || !signedData) {
      console.error('Signed upload error:', signedError);
      return new Response(JSON.stringify({ error: 'Erro ao gerar URL de upload' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Fleet upload signed URL created for user ${userId}, request ${fuel_request_id}`);

    return new Response(JSON.stringify({
      signed_url: signedData.signedUrl,
      token: signedData.token,
      path,
    }), {
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
