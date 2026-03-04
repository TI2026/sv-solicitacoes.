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
  return entry.count > 15;
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenHash = await hashToken(token);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: link, error: linkError } = await supabase
      .from('admission_public_links')
      .select('id, admission_request_id, candidate_id, link_type, expires_at, used_at, admin_uploaded_at, candidate_uploaded_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (linkError || !link) {
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (link.used_at || new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get candidate info
    const { data: candidate } = await supabase
      .from('candidates')
      .select('id, nome, admission_request_id')
      .eq('id', link.candidate_id)
      .single();

    if (!candidate) {
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // For SIGNATURE type, list admin-uploaded files
    let filesToSign: Array<{ name: string; url: string; size: number }> = [];
    if (link.link_type === 'SIGNATURE') {
      const { data: files } = await supabase.storage
        .from('admissions')
        .list(`signature/admin/${link.admission_request_id}/${candidate.id}`);

      for (const f of (files || [])) {
        if (f.name === '.emptyFolderPlaceholder') continue;
        const { data: signedUrl } = await supabase.storage
          .from('admissions')
          .createSignedUrl(`signature/admin/${link.admission_request_id}/${candidate.id}/${f.name}`, 3600);
        filesToSign.push({
          name: f.name,
          url: signedUrl?.signedUrl || '',
          size: (f as any).metadata?.size || 0,
        });
      }
    }

    // For DOCUMENTS type, list already uploaded files
    let uploadedFiles: Array<{ name: string; file_type: string }> = [];
    if (link.link_type === 'DOCUMENTS') {
      const { data: files } = await supabase
        .from('admission_files')
        .select('original_filename, file_type')
        .eq('candidate_id', candidate.id)
        .eq('link_type', 'DOCUMENTS');
      uploadedFiles = (files || []).map(f => ({ name: f.original_filename || '', file_type: f.file_type }));
    }

    console.log(`Link lookup from IP ${clientIp} for candidate ${candidate.id}, type ${link.link_type}`);

    return new Response(JSON.stringify({
      candidate_id: candidate.id,
      candidate_name: candidate.nome,
      admission_request_id: link.admission_request_id,
      link_type: link.link_type,
      expires_at: link.expires_at,
      admin_uploaded_at: link.admin_uploaded_at,
      candidate_uploaded_at: link.candidate_uploaded_at,
      files_to_sign: filesToSign,
      uploaded_files: uploadedFiles,
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
