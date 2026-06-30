import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Only the service role (Supabase Cron) OR a dedicated CRON_SECRET may invoke this function.
    // The public anon key MUST NOT be accepted here — it is embedded in the frontend bundle.
    const authHeader = req.headers.get('Authorization') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const cronSecret = Deno.env.get('CRON_SECRET') || ''
    const isService = serviceKey && authHeader === `Bearer ${serviceKey}`
    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`
    if (!isService && !isCron) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // O cron busca solicitações de abastecimento presas em 'em_aprovacao' sem fluxo de aprovação ativo.
    // 1. Buscar todas as solicitações de 'fuel_requests' em 'em_aprovacao'
    const { data: stuckRequests, error: fetchErr } = await supabaseAdmin
      .from('fuel_requests')
      .select('id')
      .eq('status', 'em_aprovacao')

    if (fetchErr) throw fetchErr

    let fixedCount = 0

    if (stuckRequests && stuckRequests.length > 0) {
      for (const req of stuckRequests) {
        // 2. Verificar se existe fluxo ativo
        const { data: activeFlows, error: flowErr } = await supabaseAdmin
          .from('approval_requests')
          .select('id')
          .eq('reference_id', req.id)
          .is('ended_at', null)
          .limit(1)

        if (flowErr) throw flowErr

        // 3. Se NÃO existe fluxo ativo, reverte o status para 'enviado' para destravar
        if (!activeFlows || activeFlows.length === 0) {
          const { error: updateErr } = await supabaseAdmin
            .from('fuel_requests')
            .update({ status: 'enviado' })
            .eq('id', req.id)

          if (updateErr) throw updateErr
          
          // Registra o log de rollback
          await supabaseAdmin.from('audit_logs').insert({
            user_id: null,
            action: 'cron_approval_sync',
            entity_type: 'fuel_requests',
            entity_id: req.id,
            details: { previous_status: 'em_aprovacao', new_status: 'enviado', reason: 'Fluxo ativo ausente' }
          })
          
          fixedCount++
        }
      }
    }

    return new Response(
      JSON.stringify({ message: 'Sync complete', fixed: fixedCount }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    console.error('[cron-approval-sync]', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
})
