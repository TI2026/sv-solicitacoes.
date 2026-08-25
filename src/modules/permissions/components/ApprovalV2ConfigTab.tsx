import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertTriangle, Building2, CheckCircle2, GitBranch, Loader2, Lock, ShieldCheck, UserCheck, XCircle,
} from 'lucide-react';
import { useEligibleApprovers } from '../hooks/usePermissionsData';
import {
  useActivateApprovalV2, useApprovalV2Health, useSaveStepAssignment,
  useSectorsWithResponsibles, useV2CutoverStatus,
} from '../hooks/useApprovalV2Config';
import type { HealthStatus, V2StepHealth } from '../queries/approvalV2Loader';

const HEALTH_META: Record<HealthStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  ready: { label: 'Pronto', className: 'bg-emerald-100 text-emerald-800', Icon: CheckCircle2 },
  warning: { label: 'Atenção', className: 'bg-amber-100 text-amber-800', Icon: AlertTriangle },
  blocked: { label: 'Bloqueado', className: 'bg-destructive/10 text-destructive', Icon: XCircle },
};

function HealthBadge({ status }: { status: HealthStatus }) {
  const meta = HEALTH_META[status];
  return (
    <Badge className={`${meta.className} text-xs gap-1`}>
      <meta.Icon className="w-3 h-3" />
      {meta.label}
    </Badge>
  );
}

export default function ApprovalV2ConfigTab() {
  const { data: health, isLoading } = useApprovalV2Health();
  const { data: cutover } = useV2CutoverStatus();
  const { data: approvers } = useEligibleApprovers();
  const { data: sectors } = useSectorsWithResponsibles();
  const saveMutation = useSaveStepAssignment();
  const activateMutation = useActivateApprovalV2();

  const [editing, setEditing] = useState<V2StepHealth | null>(null);
  const [mode, setMode] = useState<'person' | 'sector'>('person');
  const [primaryId, setPrimaryId] = useState<string>('');
  const [substituteId, setSubstituteId] = useState<string>('');
  const [sectorId, setSectorId] = useState<string>('');
  const [sla, setSla] = useState<number>(48);

  const stepsByModule = useMemo(() => {
    const map = new Map<string, V2StepHealth[]>();
    (health?.steps || []).forEach(s => {
      const list = map.get(s.module_code) || [];
      list.push(s);
      map.set(s.module_code, list);
    });
    return map;
  }, [health]);

  const openEditor = (step: V2StepHealth) => {
    setEditing(step);
    setMode(step.assignment_mode === 'sector' ? 'sector' : 'person');
    setPrimaryId(step.primary_user_id || '');
    setSubstituteId(step.substitute_user_id || '');
    setSectorId(step.sector_id || '');
    setSla(step.sla_hours || 48);
  };

  const selectedSector = sectors?.find(s => s.id === sectorId);
  const templatesReady = health?.template.ok === true;
  const configurationStatus: HealthStatus = health?.overall ?? 'blocked';
  const motorActive = (health?.modules?.length ?? 0) === 6
    && health!.modules.every(module => module.flow_active);
  const cutoverReady = cutover?.can_activate === true;

  // Contrato V2: Pessoa exige responsável + substituto + SLA; Setor exige setor
  // com responsável/substituto válidos + SLA. Nada é opcional.
  const sectorAssignable = !!selectedSector?.responsible_name && !!selectedSector?.substitute_name;
  const canSave =
    sla > 0 &&
    (mode === 'person'
      ? !!primaryId && !!substituteId && primaryId !== substituteId
      : !!sectorId && sectorAssignable);

  const handleSave = () => {
    if (!editing || !canSave) return;
    saveMutation.mutate(
      {
        stepId: editing.step_id,
        assignmentMode: mode,
        primaryUserId: mode === 'person' ? primaryId : null,
        substituteUserId: mode === 'person' ? substituteId : null,
        sectorId: mode === 'sector' ? sectorId : null,
        slaHours: sla,
      },
      { onSuccess: () => setEditing(null) },
    );
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Configurações de Aprovação — Motor V2</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            As etapas de cada módulo são fixas e definidas pelo contrato do motor. Você configura apenas quem
            responde por cada etapa (Pessoa ou Setor), o substituto e o prazo.
          </p>
          <p className="text-xs text-muted-foreground">
            {health?.flows_total ?? 0} módulos · {health?.steps_total ?? 0} etapas
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-3">
            <div className="rounded-md border bg-background p-2.5">
              <p className="text-[11px] text-muted-foreground">Templates</p>
              <p className="text-sm font-semibold">{templatesReady ? 'Prontos' : 'Bloqueados'}</p>
            </div>
            <div className="rounded-md border bg-background p-2.5 space-y-1">
              <p className="text-[11px] text-muted-foreground">Configuração</p>
              <HealthBadge status={configurationStatus} />
            </div>
            <div className="rounded-md border bg-background p-2.5">
              <p className="text-[11px] text-muted-foreground">Motor</p>
              <p className="text-sm font-semibold">{motorActive ? 'Ativo' : 'Inativo'}</p>
            </div>
            <div className="rounded-md border bg-background p-2.5">
              <p className="text-[11px] text-muted-foreground">Cutover</p>
              <p className="text-sm font-semibold">{cutoverReady ? 'Pronto' : 'Bloqueado'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {cutover && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ativação do Motor V2</CardTitle>
            <CardDescription className="text-xs">
              A ativação só é liberada quando todos os módulos estiverem prontos e não houver nenhuma
              solicitação do motor anterior em andamento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {cutover.active_v1_count > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="text-sm">
                  {cutover.active_v1_count} solicitação(ões) do motor anterior ainda em andamento
                </AlertTitle>
                <AlertDescription className="text-xs space-y-1 mt-1">
                  {cutover.active_v1_requests.map(r => (
                    <div key={r.approval_request_id}>
                      {r.module_code} · etapa {r.current_step_order ?? '—'} · status {r.status} ·
                      criada em {new Date(r.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  ))}
                </AlertDescription>
              </Alert>
            )}
            <Button
              className="gap-2"
              disabled={!cutover.can_activate || activateMutation.isPending}
              onClick={() => activateMutation.mutate()}
            >
              {activateMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Lock className="w-4 h-4" />}
              {activateMutation.isPending ? 'Ativando…' : 'Ativar Motor V2'}
            </Button>
            {!cutover.can_activate && (
              <p className="text-xs text-muted-foreground">
                Ativação bloqueada enquanto houver pendências de configuração ou solicitações do motor anterior.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {(health?.modules || []).map(mod => (
        <Card key={mod.module_code}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <GitBranch className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-base">{mod.module_name}</CardTitle>
                  <CardDescription className="text-xs truncate">
                    {mod.flow_name} · {mod.steps_total} etapas obrigatórias
                  </CardDescription>
                </div>
              </div>
              <HealthBadge status={mod.status} />
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {(stepsByModule.get(mod.module_code) || []).map(step => (
              <div key={step.step_id} className="flex items-start gap-3 p-2.5 rounded-md border bg-card">
                <Badge variant="secondary" className="shrink-0">Etapa {step.step_order}</Badge>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm">
                    {step.assignment_mode === 'sector'
                      ? <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                      : <UserCheck className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className="font-medium truncate">{step.step_name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {step.assignment_mode === 'sector'
                      ? <>Setor: <span className="text-foreground">{step.sector_name || '—'}</span>
                          {' · '}Responsável: <span className="text-foreground">{step.sector_responsible_name || '—'}</span></>
                      : <>Pessoa: <span className="text-foreground">{step.primary_user_name || '—'}</span>
                          {' · '}Substituto: <span className="text-foreground">{step.substitute_user_name || '—'}</span></>}
                  </p>
                  <p className="text-xs text-muted-foreground">Prazo: {step.sla_hours ?? 48}h</p>
                  {step.reason && (
                    <p className="text-xs text-destructive">{step.reason}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <HealthBadge status={step.status} />
                  <Button variant="outline" size="sm" onClick={() => openEditor(step)}>Configurar</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editing ? `Etapa ${editing.step_order} — ${editing.step_name}` : ''}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs">Tipo de responsável</Label>
              <Select value={mode} onValueChange={v => setMode(v as 'person' | 'sector')}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="person" className="text-sm">Pessoa</SelectItem>
                  <SelectItem value="sector" className="text-sm">Setor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === 'person' ? (
              <>
                <div>
                  <Label className="text-xs">Responsável</Label>
                  <Select value={primaryId} onValueChange={setPrimaryId}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
                    <SelectContent>
                      {(approvers || []).map((p: any) => (
                        <SelectItem key={p.id} value={p.id} className="text-sm">{p.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Substituto (obrigatório)</Label>
                  <Select value={substituteId} onValueChange={setSubstituteId}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Selecionar substituto" /></SelectTrigger>
                    <SelectContent>
                      {(approvers || []).filter((p: any) => p.id !== primaryId).map((p: any) => (
                        <SelectItem key={p.id} value={p.id} className="text-sm">{p.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-xs">Setor</Label>
                  <Select value={sectorId} onValueChange={setSectorId}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Selecionar setor" /></SelectTrigger>
                    <SelectContent>
                      {(sectors || []).map(s => (
                        <SelectItem key={s.id} value={s.id} className="text-sm">{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedSector && (
                  <div className="rounded-md border bg-muted/40 p-2.5 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Responsável atual: <span className="text-foreground">{selectedSector.responsible_name || '— não configurado'}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Substituto atual: <span className="text-foreground">{selectedSector.substitute_name || '— não configurado'}</span>
                    </p>
                    {(!selectedSector.responsible_name || !selectedSector.substitute_name) && (
                      <p className="text-xs text-destructive">
                        Este setor precisa ter responsável e substituto válidos — a etapa permanecerá bloqueada.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            <div>
              <Label className="text-xs">Prazo da etapa (horas)</Label>
              <Input
                type="number"
                min={1}
                className="text-sm"
                value={sla}
                onChange={e => setSla(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!canSave || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
