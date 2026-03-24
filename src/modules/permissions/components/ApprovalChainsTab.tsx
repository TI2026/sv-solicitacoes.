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

const APPROVER_TYPE_LABELS: Record<string, string> = {
  usuario_fixo: 'Pessoa (usuário fixo)',
  responsavel_do_setor_do_solicitante: 'Responsável do setor do solicitante',
  responsavel_do_setor_especifico: 'Responsável de setor específico',
  gestor_imediato: 'Gestor imediato',
  cargo_perfil: 'Cargo / Perfil aprovador',
};

const APPROVER_TYPE_ICONS: Record<string, any> = {
  usuario_fixo: UserCheck,
  responsavel_do_setor_do_solicitante: Building2,
  responsavel_do_setor_especifico: Building2,
  gestor_imediato: Users,
  cargo_perfil: ShieldCheck,
};

const APPROVER_TYPE_HELPERS: Record<string, string> = {
  responsavel_do_setor_do_solicitante: 'O sistema localizará automaticamente o responsável do setor do solicitante.',
  gestor_imediato: 'O sistema localizará automaticamente o gestor imediato do usuário relacionado.',
  cargo_perfil: 'Qualquer usuário com o cargo/perfil selecionado poderá aprovar esta etapa.',
};

function parseApproverType(raw: string): { type: StepDraft['approverType']; roleKey: string | null } {
  if (raw.startsWith('cargo_perfil:')) {
    return { type: 'cargo_perfil', roleKey: raw.replace('cargo_perfil:', '') };
  }
  return { type: raw as StepDraft['approverType'], roleKey: null };
}

function getDisplayApproverType(raw: string): string {
  if (raw.startsWith('cargo_perfil:')) return 'cargo_perfil';
  return raw;
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
    setFlowName('');
    setApprovalType('sequential');
    setRequireReason(true);
    setAllowReturn(false);
    setReturnMode('requester');
    setNotifyNext(true);
    setSteps([]);
    setDialogOpen(true);
  };

  const openEditFlow = (flow: any) => {
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
        .map((s: any) => {
          const parsed = parseApproverType(s.approver_type || 'usuario_fixo');
          return {
            stepOrder: s.step_order,
            approverType: parsed.type,
            fixedUserId: parsed.type === 'usuario_fixo' ? (s.approver_user_id || null) : null,
            fixedSectorId: s.fixed_sector_id || null,
            approverRoleKey: parsed.roleKey,
          };
        })
    );
    setDialogOpen(true);
  };

  const addStep = () => {
    setSteps(prev => [...prev, { stepOrder: prev.length + 1, approverType: 'usuario_fixo', fixedUserId: null, fixedSectorId: null, approverRoleKey: null }]);
  };

  const removeStep = (idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepOrder: i + 1 })));
  };

  const updateStep = (idx: number, patch: Partial<StepDraft>) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const isStepValid = (step: StepDraft) => {
    if (step.approverType === 'usuario_fixo') return !!step.fixedUserId;
    if (step.approverType === 'responsavel_do_setor_especifico') return !!step.fixedSectorId;
    if (step.approverType === 'cargo_perfil') return !!step.approverRoleKey;
    return true;
  };

  const canSave = flowName.trim() && steps.length > 0 && steps.every(isStepValid);

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
    const raw = step.approver_type || 'usuario_fixo';
    const displayType = getDisplayApproverType(raw);
    const label = APPROVER_TYPE_LABELS[displayType] || raw;
    if (displayType === 'usuario_fixo') {
      return `${label}: ${step.profiles?.full_name || 'N/A'}`;
    }
    if (displayType === 'responsavel_do_setor_especifico') {
      return `${label}: ${step.sectors?.name || 'N/A'}`;
    }
    if (raw.startsWith('cargo_perfil:')) {
      const roleKey = raw.replace('cargo_perfil:', '');
      return `Cargo: ${roleKey}`;
    }
    return label;
  };

  // Check sectors without responsible
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
                        ? `Fluxo: ${activeFlow.name} · ${activeFlow.approval_type === 'sequential' ? 'Sequencial' : 'Paralelo'} · ${stepsCount} etapa(s)`
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
                    <Button size="sm" onClick={() => openNewFlow(mod.id)} className="gap-1">
                      <Plus className="w-4 h-4" /> Criar fluxo
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            {activeFlow && (
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge variant="secondary" className="text-xs gap-1">
                    {activeFlow.approval_type === 'sequential' ? 'Sequencial' : 'Paralela'}
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
                <div className="flex items-center gap-2 flex-wrap">
                  {activeFlow.approval_flow_steps
                    ?.sort((a: any, b: any) => a.step_order - b.step_order)
                    .filter((s: any) => s.active)
                    .map((step: any, idx: number) => {
                      const displayType = getDisplayApproverType(step.approver_type || 'usuario_fixo');
                      const Icon = APPROVER_TYPE_ICONS[displayType] || UserCheck;
                      return (
                        <div key={step.id} className="flex items-center gap-1">
                          {idx > 0 && <span className="text-muted-foreground">→</span>}
                          <Badge variant="outline" className="text-xs gap-1">
                            <Icon className="w-3 h-3" />
                            {step.step_order}. {getStepBadgeLabel(step)}
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

          <div className="space-y-4">
            {/* Flow config */}
            <div>
              <Label>Nome do fluxo</Label>
              <Input value={flowName} onChange={e => setFlowName(e.target.value)} placeholder="Ex: Aprovação padrão" />
            </div>

            <div>
              <Label>Tipo de aprovação</Label>
              <Select value={approvalType} onValueChange={setApprovalType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequencial</SelectItem>
                  <SelectItem value="parallel" disabled>Paralela (em breve)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Sequencial: cada etapa é processada na ordem. A próxima etapa só fica ativa após a conclusão da anterior.
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
                <Label>Etapas de Aprovação</Label>
                <Button variant="outline" size="sm" onClick={addStep} className="gap-1">
                  <Plus className="w-3 h-3" /> Adicionar etapa
                </Button>
              </div>
              {steps.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Adicione ao menos uma etapa de aprovação</p>
              )}
              {steps.map((step, idx) => (
                <div key={idx} className="border border-border rounded-lg p-3 mb-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="shrink-0">Etapa {step.stepOrder}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeStep(idx)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>

                  <div>
                    <Label className="text-xs">Tipo de aprovador</Label>
                    <Select
                      value={step.approverType}
                      onValueChange={(v) => updateStep(idx, {
                        approverType: v as StepDraft['approverType'],
                        fixedUserId: null,
                        fixedSectorId: null,
                        approverRoleKey: null,
                      })}
                    >
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(APPROVER_TYPE_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Pessoa (usuario_fixo) - only eligible approvers */}
                  {step.approverType === 'usuario_fixo' && (
                    <div>
                      <Label className="text-xs">Aprovador</Label>
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
                      <p className="text-[10px] text-muted-foreground mt-0.5">Apenas usuários com perfil aprovador (não-colaborador) são exibidos.</p>
                    </div>
                  )}

                  {/* Setor específico */}
                  {step.approverType === 'responsavel_do_setor_especifico' && (
                    <div>
                      <Label className="text-xs">Setor</Label>
                      <Select
                        value={step.fixedSectorId || ''}
                        onValueChange={(v) => updateStep(idx, { fixedSectorId: v })}
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
                      {!step.fixedSectorId && (
                        <p className="text-xs text-destructive mt-1">Selecione um setor</p>
                      )}
                      {step.fixedSectorId && getSectorWarning(step.fixedSectorId) && (
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {getSectorWarning(step.fixedSectorId)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Cargo / Perfil aprovador */}
                  {step.approverType === 'cargo_perfil' && (
                    <div>
                      <Label className="text-xs">Cargo / Perfil aprovador</Label>
                      <Select
                        value={step.approverRoleKey || ''}
                        onValueChange={(v) => updateStep(idx, { approverRoleKey: v })}
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="Selecionar cargo" />
                        </SelectTrigger>
                        <SelectContent>
                          {approverRoles?.map((r: any) => (
                            <SelectItem key={r.key} value={r.key} className="text-xs">
                              {r.name || r.key}
                              {r.is_master && ' (Master)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!step.approverRoleKey && (
                        <p className="text-xs text-destructive mt-1">Selecione um cargo</p>
                      )}
                    </div>
                  )}

                  {APPROVER_TYPE_HELPERS[step.approverType] && (
                    <p className="text-xs text-muted-foreground flex items-start gap-1">
                      <Info className="w-3 h-3 mt-0.5 shrink-0" />
                      {APPROVER_TYPE_HELPERS[step.approverType]}
                    </p>
                  )}
                </div>
              ))}
            </div>

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
