import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, GitBranch, CheckCircle2, XCircle, Info, Users, Building2, UserCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useApprovalModules, useApprovalFlows, useSaveApprovalFlow, useProfiles, useSectors, StepDraft } from '../hooks/usePermissionsData';

const APPROVER_TYPE_LABELS: Record<string, string> = {
  usuario_fixo: 'Usuário fixo',
  responsavel_do_setor_do_solicitante: 'Responsável do setor do solicitante',
  responsavel_do_setor_especifico: 'Responsável do setor específico',
  gestor_imediato: 'Gestor imediato',
};

const APPROVER_TYPE_ICONS: Record<string, any> = {
  usuario_fixo: UserCheck,
  responsavel_do_setor_do_solicitante: Building2,
  responsavel_do_setor_especifico: Building2,
  gestor_imediato: Users,
};

const APPROVER_TYPE_HELPERS: Record<string, string> = {
  responsavel_do_setor_do_solicitante: 'O sistema localizará automaticamente o responsável do setor do solicitante.',
  gestor_imediato: 'O sistema localizará automaticamente o gestor imediato do usuário relacionado.',
};

export default function ApprovalChainsTab() {
  const { user } = useAuth();
  const { data: modules, isLoading: modLoading } = useApprovalModules();
  const { data: flows, isLoading: flowsLoading } = useApprovalFlows();
  const { data: profiles } = useProfiles();
  const { data: sectors } = useSectors();
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
        .map((s: any) => ({
          stepOrder: s.step_order,
          approverType: s.approver_type || 'usuario_fixo',
          fixedUserId: s.approver_type === 'usuario_fixo' || !s.approver_type
            ? (s.approver_user_id || null)
            : null,
          fixedSectorId: s.fixed_sector_id || null,
        }))
    );
    setDialogOpen(true);
  };

  const addStep = () => {
    setSteps(prev => [...prev, { stepOrder: prev.length + 1, approverType: 'usuario_fixo', fixedUserId: null, fixedSectorId: null }]);
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
    const type = step.approver_type || 'usuario_fixo';
    const label = APPROVER_TYPE_LABELS[type] || type;
    if (type === 'usuario_fixo') {
      return `${label}: ${step.profiles?.full_name || 'N/A'}`;
    }
    if (type === 'responsavel_do_setor_especifico') {
      return `${label}: ${step.sectors?.name || 'N/A'}`;
    }
    return label;
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
            Configure os fluxos de aprovação para cada módulo do sistema. Os fluxos definem quem aprova cada solicitação e em qual ordem.
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
                    Devolução
                  </Badge>
                  {activeFlow.active && <Badge className="bg-green-100 text-green-800 text-xs">Ativo</Badge>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {activeFlow.approval_flow_steps
                    ?.sort((a: any, b: any) => a.step_order - b.step_order)
                    .filter((s: any) => s.active)
                    .map((step: any, idx: number) => {
                      const Icon = APPROVER_TYPE_ICONS[step.approver_type || 'usuario_fixo'] || UserCheck;
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
                  <SelectItem value="parallel">Paralela (fase 2)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
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

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Etapas de Aprovação</Label>
                <Button variant="outline" size="sm" onClick={addStep} className="gap-1">
                  <Plus className="w-3 h-3" /> Adicionar
                </Button>
              </div>
              {steps.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Adicione ao menos uma etapa</p>
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
                          {profiles?.map((p: any) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">{p.full_name} ({p.email})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!step.fixedUserId && (
                        <p className="text-xs text-destructive mt-1">Selecione um aprovador</p>
                      )}
                    </div>
                  )}

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
                            <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!step.fixedSectorId && (
                        <p className="text-xs text-destructive mt-1">Selecione um setor</p>
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
