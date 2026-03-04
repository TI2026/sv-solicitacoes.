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
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const purpose = url.searchParams.get('purpose') || 'documents';

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: tokenRow, error: tokenError } = await supabase
      .from('public_tokens')
      .select('id, candidate_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (tokenError || !tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
      console.log(`Token validation failed from IP ${clientIp}`);
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: candidate } = await supabase
      .from('candidates')
      .select('id, nome')
      .eq('id', tokenRow.candidate_id)
      .single();

    if (!candidate) {
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === PURPOSE: SIGNATURE ===
    if (purpose === 'signature') {
      // List admin-uploaded files for signing
      const { data: files } = await supabase.storage
        .from('admissions')
        .list(`candidates/${candidate.id}/signature-outgoing`);

      const signatureFiles = [];
      for (const f of (files || [])) {
        if (f.name === '.emptyFolderPlaceholder') continue;
        const { data: signedUrl } = await supabase.storage
          .from('admissions')
          .createSignedUrl(`candidates/${candidate.id}/signature-outgoing/${f.name}`, 3600);
        signatureFiles.push({
          name: f.name,
          url: signedUrl?.signedUrl || '',
          size: (f as any).metadata?.size || 0,
        });
      }

      console.log(`Signature token validated from IP ${clientIp} for candidate ${candidate.id}`);

      return new Response(JSON.stringify({
        candidate_id: candidate.id,
        candidate_name: candidate.nome,
        files_to_sign: signatureFiles,
        expires_at: tokenRow.expires_at,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === PURPOSE: DOCUMENTS (default) ===
    const { data: candidateDocs } = await supabase
      .from('candidate_documents')
      .select('id, document_id, status, file_path, documents(key, label, required)')
      .eq('candidate_id', candidate.id);

    const documents = (candidateDocs || []).map((cd: any) => ({
      id: cd.id,
      document_id: cd.document_id,
      label: cd.documents?.label || 'Documento',
      required: cd.documents?.required || false,
      status: cd.status,
      file_path: cd.file_path,
    }));

    console.log(`Documents token validated from IP ${clientIp} for candidate ${candidate.id}`);

    return new Response(JSON.stringify({
      candidate_id: candidate.id,
      candidate_name: candidate.nome,
      documents,
      expires_at: tokenRow.expires_at,
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
