import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token)
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = claimsData.claims.sub as string

    const { purchase_id, file_type, file_name, file_size } = await req.json()
    if (!purchase_id || !file_type || !file_name || !file_size) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios ausentes' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!ALLOWED_TYPES.includes(file_type)) {
      return new Response(JSON.stringify({ error: 'Tipo de arquivo não permitido. Use JPEG, PNG, WebP ou PDF.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (file_size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: 'Arquivo excede o limite de 10MB.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(supabaseUrl, serviceKey)

    const { data: purchase, error: purchaseError } = await adminClient
      .from('purchases')
      .select('id, requester_user_id, status')
      .eq('id', purchase_id)
      .maybeSingle()

    if (purchaseError || !purchase) {
      return new Response(JSON.stringify({ error: 'Solicitação não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: roles } = await adminClient.rpc('get_user_roles', { _user_id: userId })
    const isAdmin = (roles || []).some((r: string) => ['diretoria', 'administrativo', 'master'].includes(r))
    const isOwner = purchase.requester_user_id === userId

    if (!isOwner && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Sem permissão para este upload' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Solicitante só pode anexar em rascunho ou devolvido
    if (isOwner && !isAdmin && !['rascunho', 'retornado'].includes(purchase.status)) {
      return new Response(JSON.stringify({ error: 'Anexos só podem ser modificados em rascunho ou solicitação devolvida.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const sanitized = file_name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
    const path = `requests/${purchase_id}/${Date.now()}_${sanitized}`

    const { data: signedData, error: signedError } = await adminClient.storage
      .from('purchase-attachments')
      .createSignedUploadUrl(path)

    if (signedError || !signedData) {
      console.error('Signed upload error:', signedError)
      return new Response(JSON.stringify({ error: 'Erro ao gerar URL de upload' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Auditoria
    await adminClient.from('audit_logs').insert({
      user_id: userId,
      action: 'attachment_upload_signed',
      entity_type: 'purchases',
      entity_id: purchase_id,
      details: { path, file_name: sanitized, file_type, file_size },
    })

    console.log(`Purchase upload signed URL created for user ${userId}, purchase ${purchase_id}`)

    return new Response(JSON.stringify({
      signed_url: signedData.signedUrl,
      token: signedData.token,
      path,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})