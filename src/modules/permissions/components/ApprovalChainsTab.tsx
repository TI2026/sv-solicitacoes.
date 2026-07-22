import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, GitBranch, CheckCircle2, XCircle, Info, Users, Building2, UserCheck, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useApprovalModules, useApprovalFlows, useSaveApprovalFlow, useEligibleApprovers, useSectors, useApproverRoles, StepDraft } from '../hooks/usePermissionsData';
import { supabase } from '@/integrations/supabase/client';

import { APPROVER_TYPE_LABELS, APPROVER_TYPE_HELPERS, getDisplayApproverType } from '@/lib/approvalLabels';

const APPROVER_TYPE_ICONS: Record<string, any> = {
  specific_user: UserCheck,
  sector: Building2,
};

function parseApproverType(raw: string): { type: StepDraft['approverType'] } {
  if (raw === 'sector' || raw === 'responsavel_do_setor_especifico') return { type: 'sector' };
  return { type: 'specific_user' };
}

export default function ApprovalChainsTab() {
  const { user } = useAuth();
  const { data: modules, isLoading: modLoading } = useApprovalModules();
  const { data: flows, isLoading: flowsLoading } = useApprovalFlows();
  const { data: eligibleApprovers } = useEligibleApprovers();
  const { data: sectors } = useSectors();
  const { data: approverRoles } = useApproverRoles();
  const saveMutation = useSaveApprovalFlow();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editModuleId, setEditModuleId] = useState('');
  const [editFlowId, setEditFlowId] = useState<string | undefined>();
  const [editFlowInUse, setEditFlowInUse] = useState(false);
  const [flowName, setFlowName] = useState('');
  const [approvalType, setApprovalType] = useState('sequential');
  const [requireReason, setRequireReason] = useState(true);
  const [allowReturn, setAllowReturn] = useState(false);
  const [returnMode, setReturnMode] = useState('requester');
  const [notifyNext, setNotifyNext] = useState(true);
  const [steps, setSteps] = useState<StepDraft[]>([]);

  const openNewFlow = (moduleId: string) => {
    setEditModuleId(moduleId);
    setEditFlowId(undefined);
    setEditFlowInUse(false);
    setFlowName('');
    setApprovalType('sequential');
    setRequireReason(true);
    setAllowReturn(false);
    setReturnMode('requester');
    setNotifyNext(true);
    setSteps([]);
    setDialogOpen(true);
  };

  const openEditFlow = async (flow: any) => {
    setEditModuleId(flow.module_id);
    setEditFlowId(flow.id);
    setFlowName(flow.name);
    setApprovalType(flow.approval_type);
    setRequireReason(flow.require_rejection_reason);
    setAllowReturn(flow.allow_return_for_adjustment);
    setReturnMode((flow as any).return_mode || 'requester');
    setNotifyNext(flow.notify_next_approver);
    setSteps(
      (flow.approval_flow_steps || [])
        .sort((a: any, b: any) => a.step_order - b.step_order)
        .filter((s: any) => s.active !== false) // hide inactive steps
        .map((s: any) => {
          const parsed = parseApproverType(s.approver_type || 'specific_user');
          return {
            id: s.id,
            stepOrder: s.step_order,
            approverType: parsed.type,
            fixedUserId: parsed.type === 'specific_user' ? (s.approver_user_id || null) : null,
            sectorId: parsed.type === 'sector' ? (s.fixed_sector_id || null) : null,
            isRequired: s.is_required,
          };
        })
    );
    const { count } = await supabase
      .from('approval_requests')
      .select('id', { count: 'exact', head: true })
      .eq('flow_id', flow.id);
    setEditFlowInUse((count || 0) > 0);
    setDialogOpen(true);
  };

  const updateStep = (idx: number, patch: Partial<StepDraft>) => {
    setSteps(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const updated = { ...s, ...patch };
      if (patch.approverType && patch.approverType !== s.approverType) {
        updated.fixedUserId = null;
        updated.sectorId = null;
      }
      return updated;
    }));
  };

  const isStepValid = (step: StepDraft) => {
    if (step.approverType === 'specific_user') return !!step.fixedUserId;
    if (step.approverType === 'sector') return !!step.sectorId;
    return true;
  };

  const getStepValidationError = (step: StepDraft, idx: number): string | null => {
    if (step.approverType === 'specific_user' && !step.fixedUserId) return `Etapa ${idx + 1}: selecione um aprovador`;
    if (step.approverType === 'sector' && !step.sectorId) return `Etapa ${idx + 1}: selecione um setor`;
    return null;
  };

  const canSave = flowName.trim() && steps.length > 0 && steps.every(isStepValid);
  const validationErrors = !canSave ? steps.map((s, i) => getStepValidationError(s, i)).filter(Boolean) : [];
  const hasDynamicSteps = false;

  const handleSave = () => {
    if (!canSave) return;
    saveMutation.mutate({
      id: editFlowId,
      moduleId: editModuleId,
      name: flowName,
      approvalType,
      requireRejectionReason: requireReason,
      allowReturn,
      returnMode,
      notifyNext,
      createdBy: user?.id || '',
      steps,
    }, { onSuccess: () => setDialogOpen(false) });
  };

  const getStepBadgeLabel = (step: any) => {
    const raw = step.approver_type || 'specific_user';
    const displayType = getDisplayApproverType(raw);
    const label = APPROVER_TYPE_LABELS[displayType] || raw;
    if (displayType === 'specific_user') {
      return `${label}: ${step.profiles?.full_name || 'N/A'}`;
    }
    if (displayType === 'sector') {
      return `${label}: ${step.sectors?.name || 'N/A'}`;
    }
    return label;
  };

  const getSectorWarning = (sectorId: string | null) => {
    if (!sectorId || !sectors) return null;
    const sector = sectors.find((s: any) => s.id === sectorId);
    if (!sector) return 'Setor não encontrado';
    if (!sector.responsible_user_id) return `Setor "${sector.name}" sem responsável configurado`;
    return null;
  };

  if (modLoading || flowsLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">Central de Aprovações</h3>
          <p className="text-xs text-muted-foreground">
            Configure os fluxos de aprovação para cada módulo. Apenas aprovadores elegíveis (não-colaboradores) podem ser selecionados.
            A aprovação obedece exclusivamente ao fluxo configurado — papéis administrativos não substituem a elegibilidade por etapa.
          </p>
        </CardContent>
      </Card>

      {modules?.map((mod: any) => {
        const activeFlow = flows?.find((f: any) => f.module_id === mod.id && f.active);
        const stepsCount = activeFlow?.approval_flow_steps?.filter((s: any) => s.active).length || 0;

        return (
          <Card key={mod.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <GitBranch className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{mod.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {activeFlow
                        ? `Fluxo: ${activeFlow.name} · Sequencial · ${stepsCount} etapa(s)`
                        : 'Nenhum fluxo ativo configurado'}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  {activeFlow ? (
                    <Button variant="outline" size="sm" onClick={() => openEditFlow(activeFlow)}>
                      Editar fluxo
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => openNewFlow(mod.id)}>
                      <Plus className="w-3.5 h-3.5" /> Configurar fluxo
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            {activeFlow && (
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge variant="secondary" className="text-xs gap-1">
                    Sequencial
                  </Badge>
                  <Badge variant={activeFlow.require_rejection_reason ? 'default' : 'outline'} className="text-xs gap-1">
                    {activeFlow.require_rejection_reason ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    Motivo recusa
                  </Badge>
                  <Badge variant={activeFlow.allow_return_for_adjustment ? 'default' : 'outline'} className="text-xs gap-1">
                    Devolução {activeFlow.allow_return_for_adjustment
                      ? (activeFlow.return_mode === 'previous_step' ? '(etapa anterior)' : '(solicitante)')
                      : ''}
                  </Badge>
                  {activeFlow.active && <Badge className="bg-green-100 text-green-800 text-xs">Ativo</Badge>}
                </div>
                <div className="space-y-2">
                  {activeFlow.approval_flow_steps
                    ?.sort((a: any, b: any) => a.step_order - b.step_order)
                    .filter((s: any) => s.active)
                    .map((step: any) => {
                      const displayType = getDisplayApproverType(step.approver_type || 'usuario_fixo');
                      const Icon = APPROVER_TYPE_ICONS[displayType] || UserCheck;
                      const typeLabel = APPROVER_TYPE_LABELS[displayType] || step.approver_type;
                      const approverName = displayType === 'sector'
                        ? (step.sectors?.name || '—')
                        : (step.profiles?.full_name || '—');
                      return (
                        <div
                          key={step.id}
                          className="flex items-start gap-3 p-2.5 rounded-md border bg-card"
                        >
                          <Badge variant="secondary" className="shrink-0">
                            Etapa {step.step_order}
                          </Badge>
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 text-sm">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="font-medium">{typeLabel}</span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              Aprovador: <span className="text-foreground">{approverName}</span>
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0 self-center">
                            {step.is_required !== false ? 'Obrigatória' : 'Opcional'}
                          </Badge>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editFlowId ? 'Editar' : 'Criar'} Fluxo de Aprovação</DialogTitle>
          </DialogHeader>

          {editFlowInUse && (
              <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 flex gap-2 items-start">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-800">
                  Este fluxo já foi usado em solicitações. Ao salvar, uma nova versão será criada automaticamente para preservar o histórico das aprovações anteriores.
                </p>
              </div>
            )}

          <div className="space-y-4">
            {/* Flow config */}
            <div>
              <Label>Nome do fluxo</Label>
              <Input value={flowName} onChange={e => setFlowName(e.target.value)} placeholder="Ex: Aprovação padrão" />
            </div>

            <div className="rounded-md border border-border bg-muted/40 p-2.5">
              <p className="text-xs font-medium text-foreground">Tipo de aprovação: Sequencial</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Cada etapa é processada na ordem. A próxima etapa só fica ativa após a conclusão da anterior.
              </p>
            </div>

            <div className="space-y-3 border border-border rounded-lg p-3">
              <p className="text-xs font-semibold text-foreground">Configuração do fluxo</p>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Exigir motivo na recusa</Label>
                <Switch checked={requireReason} onCheckedChange={setRequireReason} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Permitir devolução para ajuste</Label>
                <Switch checked={allowReturn} onCheckedChange={setAllowReturn} />
              </div>
              {allowReturn && (
                <div>
                  <Label className="text-xs">Modo de devolução</Label>
                  <Select value={returnMode} onValueChange={setReturnMode}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="requester" className="text-xs">Devolver ao solicitante</SelectItem>
                      <SelectItem value="previous_step" className="text-xs">Devolver à etapa anterior</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label className="text-sm">Notificar próximo aprovador</Label>
                <Switch checked={notifyNext} onCheckedChange={setNotifyNext} />
              </div>
            </div>

            {/* Steps */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Etapas de Aprovação (Configuração Fixa do Módulo)</Label>
              </div>
              {steps.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhuma etapa configurada no backend para este fluxo.</p>
              )}
              {steps.map((step, idx) => (
                <div key={idx} className="border border-border rounded-lg p-3 mb-2 space-y-2 relative bg-card shadow-sm opacity-100">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="shrink-0">Etapa {step.stepOrder}</Badge>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-foreground">{`Etapa ${step.stepOrder}`}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">Obrigatória</Badge>
                  </div>

                  <div>
                    <Label className="text-xs">Tipo de aprovador</Label>
                    <Select
                      value={step.approverType}
                      onValueChange={(v) => updateStep(idx, { approverType: v as StepDraft['approverType'] })}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(APPROVER_TYPE_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Pessoa (specific_user) */}
                  {step.approverType === 'specific_user' && (
                    <div>
                      <Label className="text-xs">Aprovador Específico</Label>
                      <Select
                        value={step.fixedUserId || ''}
                        onValueChange={(v) => updateStep(idx, { fixedUserId: v })}
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="Selecionar aprovador" />
                        </SelectTrigger>
                        <SelectContent>
                          {eligibleApprovers?.map((p: any) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">{p.full_name} ({p.email})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!step.fixedUserId && (
                        <p className="text-xs text-destructive mt-1">Selecione um aprovador</p>
                      )}
                    </div>
                  )}

                  {/* Setor */}
                  {step.approverType === 'sector' && (
                    <div>
                      <Label className="text-xs">Setor</Label>
                      <Select
                        value={step.sectorId || ''}
                        onValueChange={(v) => updateStep(idx, { sectorId: v })}
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="Selecionar setor" />
                        </SelectTrigger>
                        <SelectContent>
                          {sectors?.map((s: any) => (
                            <SelectItem key={s.id} value={s.id} className="text-xs">
                              {s.name}
                              {s.responsible_user_id ? ` (resp: ${(s as any).profiles?.full_name || '—'})` : ' ⚠ sem responsável'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!step.sectorId && (
                        <p className="text-xs text-destructive mt-1">Selecione um setor</p>
                      )}
                      {step.sectorId && getSectorWarning(step.sectorId) && (
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {getSectorWarning(step.sectorId)}
                        </p>
                      )}
                    </div>
                  )}

                  {APPROVER_TYPE_HELPERS[step.approverType] && (
                    <div className="bg-muted p-2.5 rounded-md text-[11px] text-muted-foreground flex gap-2 items-start mt-3">
                      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/70" />
                      <span>{APPROVER_TYPE_HELPERS[step.approverType]}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Validation errors list */}
            {!canSave && steps.length > 0 && validationErrors.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                <p className="text-xs font-semibold text-destructive">Corrija antes de salvar:</p>
                {validationErrors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive">• {err}</p>
                ))}
              </div>
            )}

            {!flowName.trim() && steps.length > 0 && (
              <p className="text-xs text-destructive">• Informe o nome do fluxo</p>
            )}

            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || !canSave}
              className="w-full"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar fluxo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
