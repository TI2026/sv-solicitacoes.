import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, GitBranch, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useApprovalModules, useApprovalFlows, useSaveApprovalFlow, useProfiles } from '../hooks/usePermissionsData';

interface StepDraft {
  approverUserId: string;
  stepOrder: number;
}

export default function ApprovalChainsTab() {
  const { user } = useAuth();
  const { data: modules, isLoading: modLoading } = useApprovalModules();
  const { data: flows, isLoading: flowsLoading } = useApprovalFlows();
  const { data: profiles } = useProfiles();
  const saveMutation = useSaveApprovalFlow();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editModuleId, setEditModuleId] = useState('');
  const [editFlowId, setEditFlowId] = useState<string | undefined>();
  const [flowName, setFlowName] = useState('');
  const [approvalType, setApprovalType] = useState('sequential');
  const [requireReason, setRequireReason] = useState(true);
  const [allowReturn, setAllowReturn] = useState(false);
  const [notifyNext, setNotifyNext] = useState(true);
  const [steps, setSteps] = useState<StepDraft[]>([]);

  const openNewFlow = (moduleId: string) => {
    setEditModuleId(moduleId);
    setEditFlowId(undefined);
    setFlowName('');
    setApprovalType('sequential');
    setRequireReason(true);
    setAllowReturn(false);
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
    setNotifyNext(flow.notify_next_approver);
    setSteps(
      (flow.approval_flow_steps || [])
        .sort((a: any, b: any) => a.step_order - b.step_order)
        .map((s: any) => ({ approverUserId: s.approver_user_id, stepOrder: s.step_order }))
    );
    setDialogOpen(true);
  };

  const addStep = () => {
    setSteps(prev => [...prev, { approverUserId: '', stepOrder: prev.length + 1 }]);
  };

  const removeStep = (idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepOrder: i + 1 })));
  };

  const handleSave = () => {
    if (!flowName.trim() || steps.length === 0 || steps.some(s => !s.approverUserId)) return;
    saveMutation.mutate({
      id: editFlowId,
      moduleId: editModuleId,
      name: flowName,
      approvalType,
      requireRejectionReason: requireReason,
      allowReturn,
      notifyNext,
      createdBy: user?.id || '',
      steps,
    }, { onSuccess: () => setDialogOpen(false) });
  };

  if (modLoading || flowsLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {modules?.map((mod: any) => {
        const activeFlow = flows?.find((f: any) => f.module_id === mod.id && f.active);

        return (
          <Card key={mod.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-primary" />
                  <div>
                    <CardTitle className="text-base">{mod.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {activeFlow ? 'Fluxo ativo configurado' : 'Nenhum fluxo ativo'}
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
                <div className="flex flex-wrap gap-2 mb-2">
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
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {activeFlow.approval_flow_steps
                    ?.sort((a: any, b: any) => a.step_order - b.step_order)
                    .map((step: any, idx: number) => (
                      <div key={step.id} className="flex items-center gap-1">
                        {idx > 0 && <span className="text-muted-foreground">→</span>}
                        <Badge variant="outline" className="text-xs">
                          {step.step_order}. {step.profiles?.full_name || 'Aprovador'}
                        </Badge>
                      </div>
                    ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
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
                  <SelectItem value="parallel">Paralela</SelectItem>
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
              <div className="flex items-center justify-between">
                <Label className="text-sm">Notificar próximo aprovador</Label>
                <Switch checked={notifyNext} onCheckedChange={setNotifyNext} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Aprovadores</Label>
                <Button variant="outline" size="sm" onClick={addStep} className="gap-1">
                  <Plus className="w-3 h-3" /> Adicionar
                </Button>
              </div>
              {steps.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Adicione ao menos um aprovador</p>
              )}
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="shrink-0">{step.stepOrder}</Badge>
                  <Select
                    value={step.approverUserId}
                    onValueChange={(v) => setSteps(prev => prev.map((s, i) => i === idx ? { ...s, approverUserId: v } : s))}
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
                  <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => removeStep(idx)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || !flowName.trim() || steps.length === 0 || steps.some(s => !s.approverUserId)}
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
