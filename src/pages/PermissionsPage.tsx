import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import RolesPermissionsTab from '@/modules/permissions/components/RolesPermissionsTab';
import UsersManagementTab from '@/modules/permissions/components/UsersManagementTab';
import ApprovalChainsTab from '@/modules/permissions/components/ApprovalChainsTab';
import MyApprovalsTab from '@/modules/permissions/components/MyApprovalsTab';
import { Shield, Users, GitBranch, ClipboardCheck, ListChecks, Clock, User, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useAllApprovalRequests } from '@/modules/permissions/hooks/usePermissionsData';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApproverTypeLabel } from '@/lib/approvalLabels';

function ApprovalInProgressTab() {
  const { data: requests, isLoading } = useAllApprovalRequests();
  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const isReallyActive = (r: any) => !r.ended_at && !!r.current_approver_user_id && String(r.status || '').startsWith('awaiting_step_');

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const filtered = (requests || []).filter((r: any) => {
    if (moduleFilter !== 'all' && r.approval_modules?.code !== moduleFilter) return false;
    if (statusFilter === 'active' && !isReallyActive(r)) return false;
    if (statusFilter === 'ended' && isReallyActive(r)) return false;
    return true;
  });

  const moduleOptions = [...new Set((requests || []).map((r: any) => r.approval_modules?.code).filter(Boolean))];

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            Visão das aprovações dentro do seu escopo. As ações de aprovar/reprovar/devolver seguem exclusivas do aprovador elegível em "Minhas Aprovações".
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-3 flex-wrap">
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-40 text-xs"><SelectValue placeholder="Módulo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todos os módulos</SelectItem>
            {moduleOptions.map(code => (
              <SelectItem key={code} value={code} className="text-xs">{code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active" className="text-xs">Em andamento</SelectItem>
            <SelectItem value="ended" className="text-xs">Encerrados</SelectItem>
            <SelectItem value="all" className="text-xs">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center"><p className="text-sm text-muted-foreground">Nenhuma aprovação encontrada</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a: any) => {
            const isActive = isReallyActive(a);
            const totalSteps = a.approval_request_steps?.length || 0;
            const approvedSteps = a.approval_request_steps?.filter((s: any) => s.status === 'approved').length || 0;
            const currentStep = a.approval_request_steps?.find((s: any) => s.step_order === a.current_step_order);
            return (
              <Card key={a.id} className={isActive ? '' : 'opacity-60'}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{a.approval_modules?.name || 'Módulo'}</Badge>
                    <Badge variant={isActive ? 'outline' : a.status === 'approved' ? 'default' : 'destructive'} className="text-xs">
                      {a.status === 'approved' ? 'Aprovado' : a.status === 'rejected' ? 'Recusado' : a.status === 'returned_to_requester' ? 'Devolvido' : a.status === 'returned_for_adjustment' ? 'Devolvido' : `Etapa ${a.current_step_order || '?'}`}
                    </Badge>
                    {isActive && a.current_step_order && (
                      <span className="text-[10px] text-muted-foreground">{approvedSteps}/{totalSteps} etapas</span>
                    )}
                    {a.approval_flows?.name && (
                      <Badge variant="outline" className="text-[10px]">{a.approval_flows.name}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <User className="w-3 h-3" />
                    <span>{a.profiles?.full_name || 'Solicitante'}</span>
                    <span>·</span>
                    <Clock className="w-3 h-3" />
                    <span>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}</span>
                    {isActive && currentStep && (
                      <>
                        <span>·</span>
                        <span>Aprovador: {currentStep.profiles?.full_name || '—'}</span>
                        {currentStep.approver_rule && (
                          <Badge variant="outline" className="text-[10px]">{getApproverTypeLabel(currentStep.approver_rule)}</Badge>
                        )}
                      </>
                    )}
                  </div>
                  {isActive && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {a.approval_request_steps
                        ?.sort((x: any, y: any) => x.step_order - y.step_order)
                        .map((step: any) => (
                          <Badge
                            key={step.id}
                            variant={
                              step.status === 'approved' ? 'default' :
                              step.status === 'rejected' ? 'destructive' :
                              step.status === 'returned' ? 'secondary' :
                              step.step_order === a.current_step_order ? 'secondary' : 'outline'
                            }
                            className="text-[10px]"
                          >
                            {step.step_order}. {step.profiles?.full_name || '—'}
                          </Badge>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PermissionsPage() {
  const { hasAnyRole } = useAuth();
  const canManageSettings = hasAnyRole(['diretoria']);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-foreground">Permissões e Aprovações</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Gestão de cargos, permissões e cadeia de aprovadores
        </p>
      </div>

      <Tabs defaultValue={canManageSettings ? 'roles' : 'my-approvals'} className="space-y-4">
        <TabsList className="grid w-full" style={{ gridTemplateColumns: canManageSettings ? 'repeat(5, 1fr)' : 'repeat(2, 1fr)' }}>
          {canManageSettings && (
            <TabsTrigger value="roles" className="gap-2">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Perfis</span>
            </TabsTrigger>
          )}
          {canManageSettings && (
            <TabsTrigger value="users" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Usuários</span>
            </TabsTrigger>
          )}
          {canManageSettings && (
            <TabsTrigger value="chains" className="gap-2">
              <GitBranch className="w-4 h-4" />
              <span className="hidden sm:inline">Aprovadores</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="in-progress" className="gap-2">
            <ListChecks className="w-4 h-4" />
            <span className="hidden sm:inline">Em Andamento</span>
          </TabsTrigger>
          <TabsTrigger value="my-approvals" className="gap-2">
            <ClipboardCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Minhas Aprovações</span>
          </TabsTrigger>
        </TabsList>

        {canManageSettings && <TabsContent value="roles"><RolesPermissionsTab /></TabsContent>}
        {canManageSettings && <TabsContent value="users"><UsersManagementTab /></TabsContent>}
        {canManageSettings && <TabsContent value="chains"><ApprovalChainsTab /></TabsContent>}
        <TabsContent value="in-progress"><ApprovalInProgressTab /></TabsContent>
        <TabsContent value="my-approvals"><MyApprovalsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
