import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 20;
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
  const userAgent = req.headers.get('user-agent') || 'unknown';

  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: 'Muitas tentativas.' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { token, filename, content_type, mode, doc_key } = body;
    // mode: 'admin' (upload docs for candidate to sign) or 'candidate' (upload signed docs)
    // doc_key: optional, identifies the specific document type (e.g. CONTRATO_TRABALHO_SIGNED)

    if (!token || !filename) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios faltando' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (content_type && !allowed.includes(content_type)) {
      return new Response(JSON.stringify({ error: 'Tipo de arquivo não permitido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);
    const tokenHash = await hashToken(token);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Validate link
    const { data: link } = await supabase
      .from('admission_public_links')
      .select('id, admission_request_id, candidate_id, link_type, expires_at, used_at, admin_uploaded_at')
      .eq('token_hash', tokenHash)
      .eq('link_type', 'SIGNATURE')
      .maybeSingle();

    if (!link || link.used_at || new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SECURITY: Reject 'admin' mode from this public endpoint.
    // Admin uploads must use the authenticated admissions-create-signed-upload endpoint.
    if (mode === 'admin') {
      return new Response(JSON.stringify({ error: 'Operação não permitida' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const storagePath = `signature/signed/${link.admission_request_id}/${link.candidate_id}/${Date.now()}_${sanitizedFilename}`;

    const { data: signedData, error: signedError } = await supabase.storage
      .from('admissions')
      .createSignedUploadUrl(storagePath);

    if (signedError || !signedData) {
      console.error('Signed URL error:', signedError);
      return new Response(JSON.stringify({ error: 'Falha ao gerar URL de upload' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Record in admission_files
    const fileType = doc_key || 'signed_doc';

    // For candidate uploads with doc_key, remove previous file for same doc_key (1 file per type)
    if (doc_key) {
      const { data: existing } = await supabase
        .from('admission_files')
        .select('id, storage_path')
        .eq('candidate_id', link.candidate_id)
        .eq('file_type', doc_key)
        .eq('uploaded_by', 'CANDIDATE')
        .eq('link_type', 'SIGNATURE');
      for (const old of (existing || [])) {
        await supabase.storage.from('admissions').remove([old.storage_path]);
        await supabase.from('admission_files').delete().eq('id', old.id);
      }
    }

    await supabase.from('admission_files').insert({
      admission_request_id: link.admission_request_id,
      candidate_id: link.candidate_id,
      file_type: fileType,
      storage_path: storagePath,
      original_filename: sanitizedFilename,
      uploaded_by: 'CANDIDATE',
      link_type: 'SIGNATURE',
    });

    // Log
    await supabase.from('audit_logs').insert({
      action: 'signature_candidate_upload',
      entity_type: 'candidates',
      entity_id: link.candidate_id,
      details: { ip: clientIp, user_agent: userAgent, filename: sanitizedFilename },
    });

    console.log(`Signature ${uploadMode} upload from IP ${clientIp} for candidate ${link.candidate_id}`);

    return new Response(JSON.stringify({
      signedUrl: signedData.signedUrl,
      path: storagePath,
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
