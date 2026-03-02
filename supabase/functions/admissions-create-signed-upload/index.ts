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
    const { token, document_id, candidate_document_id, filename, content_type } = await req.json();

    if (!token || !candidate_document_id || !filename) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios faltando' }), {
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
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
        status: 401,
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
      return new Response(JSON.stringify({ error: 'Documento não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get document key for path
    const { data: doc } = await supabase
      .from('documents')
      .select('key')
      .eq('id', cdRow.document_id)
      .single();

    const docKey = doc?.key || 'unknown';
    const ext = filename.split('.').pop() || 'pdf';
    const path = `candidates/${tokenRow.candidate_id}/${docKey}/${Date.now()}.${ext}`;

    // Create signed upload URL
    const { data: signedData, error: signedError } = await supabase.storage
      .from('admissions')
      .createSignedUploadUrl(path);

    if (signedError || !signedData) {
      console.error('Signed URL error:', signedError);
      return new Response(JSON.stringify({ error: 'Erro ao gerar URL de upload' }), {
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

    console.log(`Upload URL created for candidate ${tokenRow.candidate_id}, doc ${docKey}`);

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
