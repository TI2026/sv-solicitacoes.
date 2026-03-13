import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import RolesPermissionsTab from '@/modules/permissions/components/RolesPermissionsTab';
import UsersManagementTab from '@/modules/permissions/components/UsersManagementTab';
import ApprovalChainsTab from '@/modules/permissions/components/ApprovalChainsTab';
import MyApprovalsTab from '@/modules/permissions/components/MyApprovalsTab';
import { Shield, Users, GitBranch, ClipboardCheck } from 'lucide-react';

export default function PermissionsPage() {
  const { hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['diretoria']);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-foreground">Permissões e Aprovações</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Gestão de cargos, permissões e cadeia de aprovadores
        </p>
      </div>

      <Tabs defaultValue={isAdmin ? 'roles' : 'my-approvals'} className="space-y-4">
        <TabsList className="grid w-full" style={{ gridTemplateColumns: isAdmin ? 'repeat(4, 1fr)' : '1fr' }}>
          {isAdmin && (
            <TabsTrigger value="roles" className="gap-2">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Perfis e Permissões</span>
              <span className="sm:hidden">Perfis</span>
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="users" className="gap-2">
              <Users className="w-4 h-4" />
              Usuários
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="chains" className="gap-2">
              <GitBranch className="w-4 h-4" />
              <span className="hidden sm:inline">Cadeia de Aprovadores</span>
              <span className="sm:hidden">Aprovadores</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="my-approvals" className="gap-2">
            <ClipboardCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Minhas Aprovações</span>
            <span className="sm:hidden">Aprovações</span>
          </TabsTrigger>
        </TabsList>

        {isAdmin && (
          <TabsContent value="roles">
            <RolesPermissionsTab />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="users">
            <UsersManagementTab />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="chains">
            <ApprovalChainsTab />
          </TabsContent>
        )}
        <TabsContent value="my-approvals">
          <MyApprovalsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
