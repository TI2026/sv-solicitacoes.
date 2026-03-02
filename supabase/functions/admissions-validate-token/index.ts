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
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hash the token
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Use service role to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find token
    const { data: tokenRow, error: tokenError } = await supabase
      .from('public_tokens')
      .select('id, candidate_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (tokenError || !tokenRow) {
      console.log('Token not found:', tokenHash.substring(0, 10));
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tokenRow.used_at) {
      return new Response(JSON.stringify({ error: 'Token já utilizado' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Token expirado' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch candidate
    const { data: candidate } = await supabase
      .from('candidates')
      .select('id, nome')
      .eq('id', tokenRow.candidate_id)
      .single();

    if (!candidate) {
      return new Response(JSON.stringify({ error: 'Candidato não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch documents for this candidate
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
