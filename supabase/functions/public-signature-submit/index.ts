import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SIGNATURE_FILE_TYPES } from '../_shared/admissionPublicContracts.ts'

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

function getMagicBytesMime(bytes: Uint8Array): string {
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  if (hex.startsWith('25504446')) return 'application/pdf';
  if (hex.startsWith('FFD8FF')) return 'image/jpeg';
  if (hex.startsWith('89504E47')) return 'image/png';
  return 'unknown';
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
    const formData = await req.formData();
    const token = formData.get('token') as string;
    const file = formData.get('file') as File | null;
    const mode = formData.get('mode') as string | null;
    const doc_key = formData.get('doc_key') as string | null;
    const filename = (formData.get('filename') as string | null) || file?.name || '';

    if (!token || !file || !filename || !doc_key) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios faltando' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!SIGNATURE_FILE_TYPES.has(doc_key)) {
      return new Response(JSON.stringify({ error: 'Tipo de documento assinado não permitido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (file.size > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Arquivo muito grande. Limite de 10MB.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Real content-type validation via magic bytes
    const buffer = await file.arrayBuffer();
    const firstBytes = new Uint8Array(buffer.slice(0, 4));
    const realMime = getMagicBytesMime(firstBytes);
    if (realMime === 'unknown') {
      return new Response(JSON.stringify({ error: 'Formato de arquivo não suportado ou forjado' }), {
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

    const { error: uploadError } = await supabase.storage
      .from('admissions')
      .upload(storagePath, buffer, { contentType: realMime, upsert: false });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(JSON.stringify({ error: 'Falha ao salvar o arquivo' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existing } = await supabase
      .from('admission_files')
      .select('id, storage_path')
      .eq('candidate_id', link.candidate_id)
      .eq('file_type', doc_key)
      .eq('uploaded_by', 'CANDIDATE')
      .eq('link_type', 'SIGNATURE');

    // Persist the replacement before removing any prior document.
    const { error: fileInsertError } = await supabase.from('admission_files').insert({
      admission_request_id: link.admission_request_id,
      candidate_id: link.candidate_id,
      file_type: doc_key,
      storage_path: storagePath,
      original_filename: sanitizedFilename,
      uploaded_by: 'CANDIDATE',
      link_type: 'SIGNATURE',
    });

    if (fileInsertError) {
      console.error('Signature file insert error:', fileInsertError);
      await supabase.storage.from('admissions').remove([storagePath]);
      return new Response(JSON.stringify({ error: 'Falha ao registrar o documento assinado' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    for (const old of (existing || [])) {
      await supabase.storage.from('admissions').remove([old.storage_path]);
      await supabase.from('admission_files').delete().eq('id', old.id);
    }

    // Log
    await supabase.from('audit_logs').insert({
      action: 'signature_candidate_upload',
      entity_type: 'candidates',
      entity_id: link.candidate_id,
      details: { ip: clientIp, user_agent: userAgent, filename: sanitizedFilename },
    });

    console.log(`Signature candidate upload from IP ${clientIp} for candidate ${link.candidate_id}`);

    return new Response(JSON.stringify({
      success: true,
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
