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

function getMagicBytesMime(bytes: Uint8Array): string {
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  if (hex.startsWith('25504446')) return 'application/pdf';
  if (hex.startsWith('FFD8FF')) return 'image/jpeg';
  if (hex.startsWith('89504E47')) return 'image/png';
  if (hex.startsWith('52494646')) return 'image/webp';
  return 'unknown';
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
    const formData = await req.formData();
    const token = formData.get('token') as string;
    const file = formData.get('file') as File | null;
    const purpose = formData.get('purpose') as string | null;
    const candidate_document_id = formData.get('candidate_document_id') as string | null;
    const filename = (formData.get('filename') as string | null) || file?.name || '';

    if (!token || !file || !filename) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios faltando' }), {
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

      const { error: uploadError } = await supabase.storage
        .from('admissions')
        .upload(path, buffer, { contentType: realMime, upsert: false });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return new Response(JSON.stringify({ error: 'Falha ao salvar o arquivo' }), {
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
        success: true,
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

    const { error: uploadError } = await supabase.storage
      .from('admissions')
      .upload(path, buffer, { contentType: realMime, upsert: false });

    if (uploadError) {
      console.error('Upload error:', uploadError);
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
      success: true,
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
