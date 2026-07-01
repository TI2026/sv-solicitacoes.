import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user with anon client
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // Check role
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const userRoles = (roles || []).map((r: any) => r.role);
    if (!userRoles.some((r: string) => ['diretoria', 'administrativo'].includes(r))) {
      return new Response(JSON.stringify({ error: 'Sem permissão' }), { status: 403, headers: corsHeaders });
    }

    const { startDate, endDate, format } = await req.json();
    if (!startDate || !endDate || !format) {
      return new Response(JSON.stringify({ error: 'Parâmetros inválidos' }), { status: 400, headers: corsHeaders });
    }

    // Fetch data
    const { data: requests, error: fetchError } = await serviceClient
      .from('fuel_requests')
      .select('id, valor, status, type, placa, categoria, data_abastecimento, created_at, person_name, km, daily_value, daily_category, motivo, notes, profiles!fuel_requests_requester_user_id_fkey(full_name, department)')
      .is('deleted_at', null)
      .gte('data_abastecimento', startDate)
      .lte('data_abastecimento', endDate)
      .order('data_abastecimento', { ascending: true });

    if (fetchError) throw fetchError;
    const data = requests || [];

    // Aggregations
    const totalGeral = data.reduce((s, r) => s + Number(r.valor || 0), 0);

    // By type
    const byType: Record<string, { count: number; total: number }> = {};
    data.forEach((r: any) => {
      const t = r.type || 'abastecimento';
      if (!byType[t]) byType[t] = { count: 0, total: 0 };
      byType[t].count++;
      byType[t].total += Number(r.valor || 0);
    });

    // By department/sector
    const bySector: Record<string, { count: number; total: number }> = {};
    data.forEach((r: any) => {
      const dept = r.profiles?.department || 'Não informado';
      if (!bySector[dept]) bySector[dept] = { count: 0, total: 0 };
      bySector[dept].count++;
      bySector[dept].total += Number(r.valor || 0);
    });

    // By collaborator
    const byCollab: Record<string, { count: number; total: number }> = {};
    data.forEach((r: any) => {
      const name = r.profiles?.full_name || r.person_name || 'Não informado';
      if (!byCollab[name]) byCollab[name] = { count: 0, total: 0 };
      byCollab[name].count++;
      byCollab[name].total += Number(r.valor || 0);
    });

    const typeLabels: Record<string, string> = { abastecimento: 'Abastecimento', reembolso: 'Reembolso', diaria: 'Diária' };
    const statusLabels: Record<string, string> = {
      rascunho: 'Rascunho', enviado: 'Enviado', em_aprovacao: 'Em Aprovação',
      aprovado: 'Aprovado', reprovado: 'Reprovado', retornado: 'Retornado',
      concluido: 'Concluído', encerrado: 'Encerrado', em_revisao: 'Em Revisão',
      aguardando_fotos: 'Aguardando Fotos', em_revisao_admin: 'Em Revisão Admin',
      aguardando_oc: 'Aguardando OC', aguardando_pagamento: 'Aguardando Pagamento',
      pago: 'Pago', ativa: 'Ativa',
    };

    const fmtDate = (d: string) => {
      try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return d; }
    };
    const fmtCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const esc = (v: any) => String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();

      // Resumo
      const resumoData = [
        ['Relatório de Despesas'],
        ['Período', `${fmtDate(startDate)} a ${fmtDate(endDate)}`],
        ['Total de Solicitações', data.length],
        ['Valor Total', fmtCurrency(totalGeral)],
        [],
        ['Resumo por Tipo'],
        ['Tipo', 'Quantidade', 'Valor Total'],
        ...Object.entries(byType).map(([t, v]) => [typeLabels[t] || t, v.count, fmtCurrency(v.total)]),
      ];
      const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
      wsResumo['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

      // Por Tipo
      const tipoRows = Object.entries(byType).map(([t, v]) => ({
        Tipo: typeLabels[t] || t, Quantidade: v.count, 'Valor Total': fmtCurrency(v.total),
        'Média': fmtCurrency(v.count > 0 ? v.total / v.count : 0),
      }));
      const wsTipo = XLSX.utils.json_to_sheet(tipoRows);
      wsTipo['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsTipo, 'Por Tipo');

      // Por Setor
      const setorRows = Object.entries(bySector)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([s, v]) => ({
          Setor: s, Quantidade: v.count, 'Valor Total': fmtCurrency(v.total),
        }));
      const wsSetor = XLSX.utils.json_to_sheet(setorRows);
      wsSetor['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsSetor, 'Por Setor');

      // Por Colaborador
      const collabRows = Object.entries(byCollab)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([n, v]) => ({
          Colaborador: n, Quantidade: v.count, 'Valor Total': fmtCurrency(v.total),
        }));
      const wsCollab = XLSX.utils.json_to_sheet(collabRows);
      wsCollab['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsCollab, 'Por Colaborador');

      // Detalhamento
      const detailRows = data.map((r: any) => ({
        Data: fmtDate(r.data_abastecimento),
        Tipo: typeLabels[r.type] || r.type,
        Solicitante: r.profiles?.full_name || r.person_name || '',
        Placa: r.placa || '',
        Categoria: r.categoria || r.daily_category || '',
        Valor: fmtCurrency(Number(r.valor || 0)),
        Status: statusLabels[r.status] || r.status,
        Motivo: r.motivo || '',
      }));
      const wsDetail = XLSX.utils.json_to_sheet(detailRows);
      wsDetail['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalhamento');

      const buf = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      return new Response(JSON.stringify({ base64: buf, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PDF — generate simple text-based report
    if (format === 'pdf') {
      let html = `<html><head><meta charset="utf-8"><style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Inter',Arial,sans-serif;padding:0;font-size:11px;color:#1a1a1a;background:#fff}
        .header{background:linear-gradient(135deg,#149047,#0d6e34);color:#fff;padding:32px 40px 24px;margin-bottom:0}
        .header h1{font-size:22px;font-weight:700;margin-bottom:4px;letter-spacing:-0.3px}
        .header .subtitle{font-size:12px;opacity:0.85;font-weight:400}
        .summary-bar{display:flex;gap:0;border-bottom:2px solid #149047;background:#f0faf4}
        .summary-item{flex:1;padding:16px 20px;border-right:1px solid #d4edda;text-align:center}
        .summary-item:last-child{border-right:none}
        .summary-item .label{font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#666;font-weight:600;margin-bottom:4px}
        .summary-item .value{font-size:18px;font-weight:700;color:#149047}
        .content{padding:24px 40px 40px}
        h2{font-size:13px;font-weight:700;color:#149047;text-transform:uppercase;letter-spacing:0.5px;margin-top:28px;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #e8f5ee}
        h2:first-child{margin-top:0}
        table{border-collapse:collapse;width:100%;margin-bottom:8px;font-size:10.5px}
        th{background:#149047;color:#fff;padding:8px 10px;text-align:left;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.3px}
        td{padding:7px 10px;border-bottom:1px solid #e8e8e8}
        tr:nth-child(even){background:#f8fdf9}
        tr:hover{background:#edf7f0}
        .right{text-align:right}
        .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600}
        .total-row{font-weight:700;background:#e8f5ee !important;border-top:2px solid #149047}
        .total-row td{padding:9px 10px}
        .footer{margin-top:32px;padding-top:12px;border-top:1px solid #ddd;font-size:9px;color:#999;text-align:center}
        @media print{body{padding:0}.header{-webkit-print-color-adjust:exact;print-color-adjust:exact}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}tr:nth-child(even){-webkit-print-color-adjust:exact;print-color-adjust:exact}.summary-bar{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      </style></head><body>`;

      // Header
      html += `<div class="header">
        <h1>Relatório de Despesas</h1>
        <div class="subtitle">Período: ${esc(fmtDate(startDate))} a ${esc(fmtDate(endDate))} · Gerado em ${esc(fmtDate(new Date().toISOString()))}</div>
      </div>`;

      // Summary bar
      const avgPerRequest = data.length > 0 ? totalGeral / data.length : 0;
      html += `<div class="summary-bar">
        <div class="summary-item"><div class="label">Total Solicitações</div><div class="value">${data.length}</div></div>
        <div class="summary-item"><div class="label">Valor Total</div><div class="value">${fmtCurrency(totalGeral)}</div></div>
        <div class="summary-item"><div class="label">Média por Solicitação</div><div class="value">${fmtCurrency(avgPerRequest)}</div></div>
        <div class="summary-item"><div class="label">Tipos</div><div class="value">${Object.keys(byType).length}</div></div>
      </div>`;

      html += `<div class="content">`;

      // Por Tipo
      html += `<h2>Resumo por Tipo</h2><table><tr><th>Tipo</th><th class="right">Qtd</th><th class="right">Valor Total</th><th class="right">Média</th></tr>`;
      Object.entries(byType).forEach(([t, v]) => {
        const avg = v.count > 0 ? v.total / v.count : 0;
        html += `<tr><td>${esc(typeLabels[t] || t)}</td><td class="right">${v.count}</td><td class="right">${esc(fmtCurrency(v.total))}</td><td class="right">${esc(fmtCurrency(avg))}</td></tr>`;
      });
      html += `<tr class="total-row"><td>Total</td><td class="right">${data.length}</td><td class="right">${fmtCurrency(totalGeral)}</td><td class="right">${fmtCurrency(avgPerRequest)}</td></tr>`;
      html += `</table>`;

      // Por Setor
      html += `<h2>Resumo por Setor</h2><table><tr><th>Setor</th><th class="right">Qtd</th><th class="right">Valor Total</th><th class="right">%</th></tr>`;
      Object.entries(bySector).sort((a, b) => b[1].total - a[1].total).forEach(([s, v]) => {
        const pct = totalGeral > 0 ? ((v.total / totalGeral) * 100).toFixed(1) : '0.0';
        html += `<tr><td>${esc(s)}</td><td class="right">${v.count}</td><td class="right">${esc(fmtCurrency(v.total))}</td><td class="right">${pct}%</td></tr>`;
      });
      html += `</table>`;

      // Por Colaborador
      html += `<h2>Resumo por Colaborador</h2><table><tr><th>Colaborador</th><th class="right">Qtd</th><th class="right">Valor Total</th><th class="right">%</th></tr>`;
      Object.entries(byCollab).sort((a, b) => b[1].total - a[1].total).slice(0, 30).forEach(([n, v]) => {
        const pct = totalGeral > 0 ? ((v.total / totalGeral) * 100).toFixed(1) : '0.0';
        html += `<tr><td>${esc(n)}</td><td class="right">${v.count}</td><td class="right">${esc(fmtCurrency(v.total))}</td><td class="right">${pct}%</td></tr>`;
      });
      html += `</table>`;

      // Detalhamento
      html += `<h2>Detalhamento</h2><table><tr><th>Data</th><th>Tipo</th><th>Solicitante</th><th>Placa</th><th class="right">Valor</th><th>Status</th></tr>`;
      data.slice(0, 200).forEach((r: any) => {
        html += `<tr><td>${esc(fmtDate(r.data_abastecimento))}</td><td>${esc(typeLabels[r.type] || r.type)}</td><td>${esc(r.profiles?.full_name || r.person_name || '')}</td><td>${esc(r.placa || '')}</td><td class="right">${esc(fmtCurrency(Number(r.valor || 0)))}</td><td>${esc(statusLabels[r.status] || r.status)}</td></tr>`;
      });
      if (data.length > 200) html += `<tr><td colspan="6" style="text-align:center;color:#999;font-style:italic">... e mais ${data.length - 200} registros</td></tr>`;
      html += `</table>`;

      html += `<div class="footer">SV Engenharia · Relatório gerado automaticamente pelo sistema SV Solicitações</div>`;
      html += `</div></body></html>`;

      // Return HTML as base64 for client-side PDF generation
      const base64 = btoa(unescape(encodeURIComponent(html)));
      return new Response(JSON.stringify({ base64, mimeType: 'text/html', isHtml: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Formato inválido' }), { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error('Export error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno ao gerar relatório' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
