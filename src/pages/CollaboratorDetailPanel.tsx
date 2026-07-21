import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Briefcase, Mail, Phone, Calendar, Clock, GitBranch, History, Shield, FileText, CheckSquare } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';

interface CollaboratorDetailPanelProps {
  collaborator: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CollaboratorDetailPanel({ collaborator, open, onOpenChange }: CollaboratorDetailPanelProps) {
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && collaborator) {
      loadDetails();
    }
  }, [open, collaborator]);

  const loadDetails = async () => {
    setLoading(true);
    try {
      // Carrega permissões do profile se disponível
      const profileId = collaborator.profile_id || collaborator.id; // se for da tabela profiles ou collaborators
      
      const { data: rolesData } = await supabase
        .from('user_role_assignments')
        .select('roles(name, description)')
        .eq('user_id', profileId);

      const roles = rolesData?.map(r => r.roles?.name) || [];

      // Carrega aprovações recentes
      const { data: approvalsData } = await supabase
        .from('approval_requests')
        .select('id, module_id, status, created_at, approval_modules(name)')
        .eq('current_approver_user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(5);

      setDetails({
        roles,
        pendingApprovals: approvalsData || []
      });
    } catch (error) {
      console.error('Error loading details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!collaborator) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] w-full overflow-y-auto">
        <SheetHeader className="mb-6">
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
        </SheetHeader>

        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="permissoes">Permissões</TabsTrigger>
            <TabsTrigger value="aprovacoes">Aprovações</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="w-3 h-3" /> Cargo</p>
                <p className="text-sm font-medium">{collaborator.job_title || collaborator.role_name || '—'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><GitBranch className="w-3 h-3" /> Setor</p>
                <p className="text-sm font-medium">{collaborator.sector?.name || collaborator.department || '—'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" /> Email</p>
                <p className="text-sm font-medium">{collaborator.email || '—'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> Telefone</p>
                <p className="text-sm font-medium">{collaborator.phone || '—'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Admissão</p>
                <p className="text-sm font-medium">
                  {collaborator.admission_date ? format(new Date(collaborator.admission_date), 'dd/MM/yyyy') : '—'}
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="permissoes" className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-1"><Shield className="w-4 h-4 text-primary" /> Papéis de Acesso</h4>
                {details?.roles?.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {details.roles.map((r: string) => (
                      <Badge key={r} variant="secondary">{r}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum papel administrativo atribuído.</p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="aprovacoes" className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1"><CheckSquare className="w-4 h-4 text-primary" /> Aprovações Pendentes</h4>
                {details?.pendingApprovals?.length > 0 ? (
                  <div className="space-y-2">
                    {details.pendingApprovals.map((req: any) => (
                      <div key={req.id} className="p-3 border rounded-lg text-sm flex justify-between items-center bg-card">
                        <div>
                          <p className="font-medium">{req.approval_modules?.name || 'Solicitação'}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(req.created_at), 'dd/MM/yyyy HH:mm')}</p>
                        </div>
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-200">Aguardando</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhuma aprovação pendente.</p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="historico" className="space-y-4">
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-3">
              <History className="w-8 h-8 opacity-50" />
              <p className="text-sm">O histórico completo será consolidado em breve.</p>
            </div>
          </TabsContent>

        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
