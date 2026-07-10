import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { refreshApprovalData } from '@/lib/refreshApprovalData';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/StatusBadge';
import { ADMISSION_STATUS_LABELS, FUEL_STATUS_LABELS, REQUEST_TYPE_LABELS } from '@/lib/constants';
import { ListChecks, CheckCircle, ShieldAlert, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function FlowControlPanel({ navigate, isRH, canSeeFinancials }: {
  navigate: (p: string) => void; isRH: boolean; canSeeFinancials: boolean;
}) {
  const { user, hasAnyRole } = useAuth();
  const qc = useQueryClient();
  const isAdminUser = hasAnyRole(['diretoria', 'administrativo']);

  const { data: fuelData = [], isLoading: fuelLoading } = useQuery({
    queryKey: ['fuel_all_fluxos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_requests')
        .select('id, valor, status, created_at, type, profiles!fuel_requests_requester_user_id_fkey(full_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: admData = [], isLoading: admLoading } = useQuery({
    queryKey: ['adm_all_fluxos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admission_requests')
        .select('id, status, cargo_funcao, created_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && isRH,
  });

  const [tab, setTab] = useState(isRH ? 'admissions' : 'fuel');
  const [showFinalized, setShowFinalized] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchAction, setBatchAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchResults, setBatchResults] = useState<{ ok: number; fail: number } | null>(null);

  const fuelByStatus = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const f of fuelData) {
      if (!showFinalized && ['concluido', 'encerrado', 'reprovado'].includes(f.status)) continue;
      const key = f.status;
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [fuelData, showFinalized]);

  const admByStatus = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const a of admData) {
      if (!showFinalized && ['concluido', 'cancelado'].includes(a.status)) continue;
      const key = a.status;
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [admData, showFinalized]);

  const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBatchApprove = async () => {
    if (selectedIds.size === 0) return;
    setBatchProcessing(true);
    let ok = 0, fail = 0;

    for (const itemId of selectedIds) {
      try {
        const { data: ar } = await supabase
          .from('approval_requests')
          .select('id, current_approver_user_id, ended_at')
          .eq('reference_id', itemId)
          .is('ended_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Motor é a única via — apenas executa se o usuário for o aprovador atual
        if (ar && ar.current_approver_user_id === user?.id) {
          const { data: result } = await supabase.rpc('process_approval_action', {
            p_approval_request_id: ar.id,
            p_action: 'approve',
            p_comments: 'Aprovação em lote',
          });
          if ((result as any)?.success) { ok++; } else { fail++; }
        } else {
          // Usuário não é o aprovador atual — registrar falha sem bypass
          fail++;
        }
      } catch { fail++; }
    }

    setBatchResults({ ok, fail });
    setSelectedIds(new Set());
    setBatchProcessing(false);
    refreshApprovalData(qc); // sem referenceId: invalida my_approvals + fuel_metrics
  };

  const handleBatchReject = async () => {
    if (selectedIds.size === 0 || !rejectReason.trim()) return;
    setBatchProcessing(true);
    let ok = 0, fail = 0;

    for (const itemId of selectedIds) {
      try {
        const { data: ar } = await supabase
          .from('approval_requests')
          .select('id, current_approver_user_id, ended_at')
          .eq('reference_id', itemId)
          .is('ended_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Motor é a única via — apenas executa se o usuário for o aprovador atual
        if (ar && ar.current_approver_user_id === user?.id) {
          const { data: result } = await supabase.rpc('process_approval_action', {
            p_approval_request_id: ar.id,
            p_action: 'reject',
            p_comments: rejectReason.trim(),
          });
          if ((result as any)?.success) { ok++; } else { fail++; }
        } else {
          // Usuário não é o aprovador atual — registrar falha sem bypass
          fail++;
        }
      } catch { fail++; }
    }

    setBatchResults({ ok, fail });
    setSelectedIds(new Set());
    setBatchAction(null);
    setRejectReason('');
    setBatchProcessing(false);
    refreshApprovalData(qc); // sem referenceId: invalida my_approvals + fuel_metrics
  };

  if (fuelLoading || admLoading) {
    return <div className="space-y-4 mt-4"><Skeleton className="h-64 rounded-lg w-full" /></div>;
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <ListChecks className="w-5 h-5" /> Controle de Fluxos
        </h2>
        <Button variant={showFinalized ? 'default' : 'outline'} size="sm" onClick={() => setShowFinalized(!showFinalized)}>
          {showFinalized ? 'Ocultar Finalizados' : 'Mostrar Finalizados'}
        </Button>
      </div>

      {batchResults && (
        <div className="p-3 rounded-lg border border-border bg-muted/50 text-sm">
          <span className="font-medium">{batchResults.ok} processadas com sucesso</span>
          {batchResults.fail > 0 && <span className="text-destructive ml-2">· {batchResults.fail} com erro</span>}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setSelectedIds(new Set()); }}>
        <TabsList className="w-full sm:w-auto">
          {isRH && <TabsTrigger value="admissions">Admissões</TabsTrigger>}
          <TabsTrigger value="fuel">Solicitações</TabsTrigger>
          <TabsTrigger value="pendencias">Pendências</TabsTrigger>
        </TabsList>

        {isRH && (
          <TabsContent value="admissions" className="mt-3 space-y-3">
            {admByStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma admissão pendente</p>
            ) : admByStatus.map(([status, items]) => (
              <Card key={status}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <StatusBadge status={status} label={ADMISSION_STATUS_LABELS[status] || status} />
                    <span className="text-xs font-semibold text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="space-y-1">
                    {items.slice(0, 5).map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1" onClick={() => navigate(`/admissions/${item.id}`)}>
                        <span className="truncate">{item.cargo_funcao || 'Admissão'}</span>
                        <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                    ))}
                    {items.length > 5 && <p className="text-xs text-muted-foreground text-center">+{items.length - 5} mais</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        )}

        <TabsContent value="fuel" className="mt-3 space-y-3">
          {fuelByStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma solicitação pendente</p>
          ) : fuelByStatus.map(([status, items]) => (
            <Card key={status}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <StatusBadge status={status} label={FUEL_STATUS_LABELS[status] || status} />
                  <span className="text-xs font-semibold text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-1">
                  {items.slice(0, 5).map((item: any) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm hover:bg-muted/50 rounded px-2 py-1">
                      {isAdminUser && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="h-4 w-4 rounded border-border accent-primary shrink-0"
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                      <div className="flex-1 flex items-center justify-between cursor-pointer" onClick={() => navigate(`/fleet/${item.id}`)}>
                        <span className="truncate">
                          {canSeeFinancials ? formatCurrency(Number(item.valor || 0)) : '••••••'}
                          {item.type && ` · ${REQUEST_TYPE_LABELS[item.type] || item.type}`}
                        </span>
                        <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                  ))}
                  {items.length > 5 && <p className="text-xs text-muted-foreground text-center">+{items.length - 5} mais</p>}
                </div>
              </CardContent>
            </Card>
          ))}

          {isAdminUser && selectedIds.size > 0 && (
            <div className="sticky bottom-0 bg-background border border-border rounded-lg p-3 flex items-center justify-between gap-3 shadow-lg">
              <span className="text-sm font-medium text-foreground">{selectedIds.size} selecionada{selectedIds.size > 1 ? 's' : ''}</span>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleBatchApprove} disabled={batchProcessing} className="gap-1">
                  {batchProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  Aprovar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setBatchAction('reject')} disabled={batchProcessing} className="gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" /> Reprovar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Limpar</Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pendencias" className="mt-3">
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm text-foreground font-medium">Itens aguardando sua ação:</p>
              {[
                ...fuelData.filter(f => f.status === 'enviado').map(f => ({ ...f, _action: 'Encaminhar para Aprovação', _path: `/fleet/${f.id}` })),
                ...fuelData.filter(f => f.status === 'em_aprovacao').map(f => ({ ...f, _action: 'Aprovar/Reprovar', _path: `/fleet/${f.id}` })),
                ...fuelData.filter(f => f.status === 'em_revisao_admin').map(f => ({ ...f, _action: 'Revisar Anexos', _path: `/fleet/${f.id}` })),
              ].slice(0, 10).map((item: any) => (
                <div key={item.id} className="flex items-center justify-between text-sm border border-border rounded-lg p-2 cursor-pointer hover:bg-muted/50" onClick={() => navigate(item._path)}>
                  <div>
                    <span className="font-medium">{canSeeFinancials ? formatCurrency(Number(item.valor || 0)) : '••••••'}</span>
                    <span className="text-xs text-muted-foreground ml-2">{item._action}</span>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs">Abrir</Button>
                </div>
              ))}
              {fuelData.filter(f => ['enviado', 'em_aprovacao', 'em_revisao_admin'].includes(f.status)).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma pendência</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={batchAction === 'reject'} onOpenChange={() => { setBatchAction(null); setRejectReason(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar {selectedIds.size} solicitação(ões)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">O mesmo motivo será aplicado a todas as reprovações.</p>
            <textarea
              className="w-full border border-border rounded-md p-3 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
              placeholder="Motivo da reprovação (obrigatório)"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setBatchAction(null); setRejectReason(''); }}>Cancelar</Button>
            <Button variant="destructive" onClick={handleBatchReject} disabled={!rejectReason.trim() || batchProcessing}>
              {batchProcessing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirmar Reprovação
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
