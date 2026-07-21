import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Briefcase, Mail, Phone, Calendar, Clock, GitBranch, History, Shield, FileText, CheckSquare, Activity } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface CollaboratorDetailPanelProps {
  collaborator: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CollaboratorDetailPanel({ collaborator, open, onOpenChange }: CollaboratorDetailPanelProps) {
  const [activeTab, setActiveTab] = useState('dados');
  const profileId = collaborator?.profile_id || collaborator?.id;

  // Reset tab when collaborator changes
  useEffect(() => {
    if (open) setActiveTab('dados');
  }, [open, collaborator]);

  // Lazy Queries
  const { data: rolesData, isLoading: loadingRoles } = useQuery({
    queryKey: ['collab_roles', profileId],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_role_assignments')
        .select('roles(name, description)')
        .eq('user_id', profileId);
      return data?.map((r: any) => r.roles?.name) || [];
    },
    enabled: !!profileId && activeTab === 'permissoes' && open,
  });

  const { data: approvalsData, isLoading: loadingApprovals } = useQuery({
    queryKey: ['collab_approvals', profileId],
    queryFn: async () => {
      const { data } = await supabase
        .from('approval_requests')
        .select('id, module_id, status, created_at, approval_modules(name)')
        .eq('current_approver_user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!profileId && activeTab === 'aprovacoes' && open,
  });

  const { data: requestsData, isLoading: loadingRequests } = useQuery({
    queryKey: ['collab_requests', profileId],
    queryFn: async () => {
      const { data } = await supabase
        .from('fuel_requests')
        .select('id, status, created_at, valor, type')
        .eq('requester_user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!profileId && activeTab === 'solicitacoes' && open,
  });

  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ['collab_history', profileId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('status_history')
        .select('*')
        .eq('actor_user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(30);
      return data || [];
    },
    enabled: !!profileId && activeTab === 'historico' && open,
  });

  if (!collaborator) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] w-full flex flex-col gap-0 p-0">
        <div className="p-6 pb-4 border-b">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-2xl font-bold flex items-center gap-2">
                {collaborator.full_name}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="font-mono text-xs">
                  {collaborator.matricula || 'Sem Matrícula'}
                </Badge>
                {collaborator.active === false ? (
                  <StatusBadge status="inativo" label="Inativo" />
                ) : (
                  <StatusBadge status="ativo" label="Ativo" />
                )}
              </SheetDescription>
            </div>
            {collaborator._isProfileOnly && (
              <Badge variant="secondary">Apenas Perfil</Badge>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="dados" className="text-xs">Dados</TabsTrigger>
              <TabsTrigger value="permissoes" className="text-xs">Acessos</TabsTrigger>
              <TabsTrigger value="solicitacoes" className="text-xs">Solics.</TabsTrigger>
              <TabsTrigger value="aprovacoes" className="text-xs">Aprovs.</TabsTrigger>
              <TabsTrigger value="historico" className="text-xs">Histórico</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="dados" className="space-y-6 mt-0">
              <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> Cargo</p>
                  <p className="text-sm font-medium">{collaborator.job_title || collaborator.role_name || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><GitBranch className="w-3.5 h-3.5" /> Setor</p>
                  <p className="text-sm font-medium">{collaborator.sector?.name || collaborator.department || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Email</p>
                  <p className="text-sm font-medium break-all">{collaborator.email || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Telefone</p>
                  <p className="text-sm font-medium">{collaborator.phone || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Admissão</p>
                  <p className="text-sm font-medium">
                    {collaborator.admission_date ? format(new Date(collaborator.admission_date), 'dd/MM/yyyy') : '—'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Último Acesso</p>
                  <p className="text-sm font-medium">
                    {collaborator.last_sign_in_at ? format(new Date(collaborator.last_sign_in_at), 'dd/MM/yyyy HH:mm') : '—'}
                  </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="permissoes" className="space-y-4 mt-0">
              {loadingRoles ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1"><Shield className="w-4 h-4 text-primary" /> Papéis de Acesso</h4>
                  {rolesData?.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {rolesData.map((r: string) => (
                        <Badge key={r} variant="secondary">{r}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum papel administrativo atribuído.</p>
                  )}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="solicitacoes" className="space-y-4 mt-0">
              {loadingRequests ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-1"><FileText className="w-4 h-4 text-primary" /> Minhas Solicitações (Recentes)</h4>
                  {requestsData?.length > 0 ? (
                    <div className="space-y-2">
                      {requestsData.map((req: any) => (
                        <div key={req.id} className="p-3 border rounded-lg text-sm flex justify-between items-center bg-card">
                          <div>
                            <p className="font-medium capitalize">{req.type || 'Abastecimento'}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(req.created_at), 'dd/MM/yyyy HH:mm')}</p>
                          </div>
                          <Badge variant="outline">{req.status}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">Nenhuma solicitação encontrada.</p>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="aprovacoes" className="space-y-4 mt-0">
              {loadingApprovals ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-1"><CheckSquare className="w-4 h-4 text-primary" /> Aprovações</h4>
                  {approvalsData?.length > 0 ? (
                    <div className="space-y-2">
                      {approvalsData.map((req: any) => (
                        <div key={req.id} className="p-3 border rounded-lg text-sm flex justify-between items-center bg-card">
                          <div>
                            <p className="font-medium">{req.approval_modules?.name || 'Solicitação'}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(req.created_at), 'dd/MM/yyyy HH:mm')}</p>
                          </div>
                          <Badge variant="outline" className={req.status === 'pendente' ? 'bg-yellow-50 text-yellow-800' : ''}>{req.status}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">Nenhuma aprovação vinculada.</p>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="historico" className="space-y-4 mt-0">
              {loadingHistory ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-1"><History className="w-4 h-4 text-primary" /> Timeline de Atividades</h4>
                  {historyData?.length > 0 ? (
                    <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                      {historyData.map((item: any, idx: number) => (
                        <div key={item.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-secondary text-secondary-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                            <Activity className="w-4 h-4" />
                          </div>
                          <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded-lg border bg-card shadow-sm">
                            <div className="flex items-center justify-between space-x-2 mb-1">
                              <span className="font-bold text-sm text-foreground">{item.entity_type}</span>
                              <time className="text-xs font-medium text-muted-foreground">{format(new Date(item.created_at), 'dd/MM HH:mm')}</time>
                            </div>
                            <p className="text-xs text-muted-foreground flex gap-1">
                              Status <Badge variant="outline" className="text-[10px] h-4 leading-3 px-1">{item.to_status}</Badge>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-3">
                      <History className="w-8 h-8 opacity-50" />
                      <p className="text-sm">Nenhuma movimentação registrada.</p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
