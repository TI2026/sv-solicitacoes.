import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = getClientIp(req);

  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: 'Muitas tentativas. Tente novamente em breve.' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  try {
    const body = await req.json();
    const { token, filename, purpose } = body;
    const candidate_document_id = body.candidate_document_id;

    if (!token || !filename) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios faltando' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate filename
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (sanitizedFilename.includes('..') || sanitizedFilename.length > 255) {
      return new Response(JSON.stringify({ error: 'Nome de arquivo inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hash token
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Validate token
    const { data: tokenRow } = await supabase
      .from('public_tokens')
      .select('candidate_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
      console.log(`Upload token validation failed from IP ${clientIp}`);
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ext = sanitizedFilename.split('.').pop() || 'pdf';

    // === PURPOSE: SIGNATURE ===
    if (purpose === 'signature') {
      const path = `candidates/${tokenRow.candidate_id}/signature-incoming/${Date.now()}.${ext}`;

      const { data: signedData, error: signedError } = await supabase.storage
        .from('admissions')
        .createSignedUploadUrl(path);

      if (signedError || !signedData) {
        console.error('Signed URL error:', signedError);
        return new Response(JSON.stringify({ error: 'Falha ao gerar URL de upload' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Log
      await supabase.from('audit_logs').insert({
        action: 'signature_upload',
        entity_type: 'candidates',
        entity_id: tokenRow.candidate_id,
        details: { ip: clientIp, filename: sanitizedFilename, purpose: 'signature' },
      });

      console.log(`Signature upload URL created from IP ${clientIp} for candidate ${tokenRow.candidate_id}`);

      return new Response(JSON.stringify({
        signedUrl: signedData.signedUrl,
        path,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === PURPOSE: DOCUMENTS (default) ===
    if (!candidate_document_id) {
      return new Response(JSON.stringify({ error: 'candidate_document_id obrigatório para documentos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify candidate_document belongs to this candidate
    const { data: cdRow } = await supabase
      .from('candidate_documents')
      .select('id, candidate_id, document_id')
      .eq('id', candidate_document_id)
      .eq('candidate_id', tokenRow.candidate_id)
      .single();

    if (!cdRow) {
      return new Response(JSON.stringify({ error: 'Envio de documento falhou' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: doc } = await supabase
      .from('documents')
      .select('key')
      .eq('id', cdRow.document_id)
      .single();

    const docKey = doc?.key || 'unknown';
    const path = `candidates/${tokenRow.candidate_id}/${docKey}/${Date.now()}.${ext}`;

    const { data: signedData, error: signedError } = await supabase.storage
      .from('admissions')
      .createSignedUploadUrl(path);

    if (signedError || !signedData) {
      console.error('Signed URL error:', signedError);
      return new Response(JSON.stringify({ error: 'Envio de documento falhou' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update candidate_document
    await supabase
      .from('candidate_documents')
      .update({
        file_path: path,
        uploaded_at: new Date().toISOString(),
        status: 'submitted',
      })
      .eq('id', candidate_document_id);

    console.log(`Upload URL created from IP ${clientIp} for candidate ${tokenRow.candidate_id}, doc ${docKey}`);

    return new Response(JSON.stringify({
      signedUrl: signedData.signedUrl,
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
