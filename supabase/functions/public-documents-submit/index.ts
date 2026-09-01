import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DOCUMENT_FILE_TYPES } from '../_shared/admissionPublicContracts.ts'

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
  if (hex.startsWith('25504446')) return 'application/pdf'; // %PDF
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
    const file = formData.get('file') as File;
    const file_type = formData.get('file_type') as string;

    if (!token || !file || !file_type) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios faltando' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!DOCUMENT_FILE_TYPES.has(file_type)) {
      return new Response(JSON.stringify({ error: 'Tipo de documento não permitido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      return new Response(JSON.stringify({ error: 'Arquivo muito grande. Limite de 10MB.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Read first bytes for magic bytes validation
    const buffer = await file.arrayBuffer();
    const firstBytes = new Uint8Array(buffer.slice(0, 4));
    const realMime = getMagicBytesMime(firstBytes);

    if (realMime === 'unknown') {
      return new Response(JSON.stringify({ error: 'Formato de arquivo não suportado ou forjado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sanitize extension
    const extMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png'
    };
    const secureExt = extMap[realMime];
    
    // Generate secure random filename
    const uuid = crypto.randomUUID();
    const storageFilename = `${Date.now()}_${uuid}.${secureExt}`;

    const tokenHash = await hashToken(token);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Validate link
    const { data: link } = await supabase
      .from('admission_public_links')
      .select('id, admission_request_id, candidate_id, link_type, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .eq('link_type', 'DOCUMENTS')
      .maybeSingle();

    if (!link || link.used_at || new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const storagePath = `documents/${link.admission_request_id}/${link.candidate_id}/${storageFilename}`;

    // Upload using service role to private bucket
    const { error: uploadError } = await supabase.storage
      .from('admissions')
      .upload(storagePath, buffer, {
        contentType: realMime,
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(JSON.stringify({ error: 'Falha ao salvar o arquivo' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Record in admission_files. Roll storage back if metadata persistence fails.
    const { error: fileInsertError } = await supabase.from('admission_files').insert({
      admission_request_id: link.admission_request_id,
      candidate_id: link.candidate_id,
      file_type,
      storage_path: storagePath,
      original_filename: file.name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100), // Keep sanitized original name for display only
      uploaded_by: 'CANDIDATE',
      link_type: 'DOCUMENTS',
    });

    if (fileInsertError) {
      console.error('Admission file insert error:', fileInsertError);
      await supabase.storage.from('admissions').remove([storagePath]);
      return new Response(JSON.stringify({ error: 'Falha ao registrar o documento' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log
    await supabase.from('audit_logs').insert({
      action: 'document_upload',
      entity_type: 'candidates',
      entity_id: link.candidate_id,
      details: { ip: clientIp, user_agent: userAgent, filename: storageFilename, file_type, realMime }
    });

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
