import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Crown, Shield, ChevronRight, Users, KeyRound } from 'lucide-react';
import { useRoles, usePermissionModules, usePermissionActions, useRolePermissionMatrix, useToggleRolePermission } from '../hooks/usePermissionsData';
import { Separator } from '@/components/ui/separator';

export default function RolesPermissionsTab() {
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: modules } = usePermissionModules();
  const { data: actions } = usePermissionActions();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const { data: matrix } = useRolePermissionMatrix(selectedRoleId || undefined);
  const toggleMutation = useToggleRolePermission();

  const selectedRole = roles?.find((r: any) => r.id === selectedRoleId);

  const isAllowed = (moduleId: string, actionId: string) => {
    return matrix?.some((m: any) => m.module_id === moduleId && m.action_id === actionId && m.allowed);
  };

  const handleToggle = (moduleId: string, actionId: string) => {
    if (!selectedRoleId || selectedRole?.is_master) return;
    const currently = isAllowed(moduleId, actionId);
    toggleMutation.mutate({
      roleId: selectedRoleId,
      moduleId,
      actionId,
      allowed: !currently,
    });
  };

  if (rolesLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const getRoleIcon = (role: any) => {
    if (role.is_master) return <Crown className="w-5 h-5 text-yellow-500" />;
    if (role.key === 'diretoria') return <KeyRound className="w-5 h-5 text-primary" />;
    return <Shield className="w-5 h-5 text-primary/70" />;
  };

  const getRoleBorderColor = (role: any) => {
    if (role.is_master) return 'border-l-yellow-500';
    if (role.key === 'diretoria') return 'border-l-primary';
    if (!role.active) return 'border-l-destructive';
    return 'border-l-muted-foreground/30';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Roles List */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Perfis do Sistema
        </h3>
        {roles?.map((role: any) => {
          const isSelected = selectedRoleId === role.id;
          return (
            <Card
              key={role.id}
              className={`cursor-pointer transition-all border-l-4 ${getRoleBorderColor(role)} ${
                isSelected
                  ? 'ring-2 ring-primary bg-primary/5 shadow-md'
                  : 'hover:shadow-sm hover:bg-muted/30'
              }`}
              onClick={() => setSelectedRoleId(role.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {getRoleIcon(role)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{role.name || role.key}</p>
                      {role.is_master && (
                        <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-600 shrink-0">
                          Master
                        </Badge>
                      )}
                      {role.is_system && !role.is_master && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">Sistema</Badge>
                      )}
                      {!role.active && (
                        <Badge variant="destructive" className="text-[10px] shrink-0">Inativo</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {role.description || 'Sem descrição'}
                    </p>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 mt-1 transition-colors ${isSelected ? 'text-primary' : 'text-muted-foreground/40'}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Permission Matrix */}
      <div className="lg:col-span-2">
        {selectedRole ? (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{getRoleIcon(selectedRole)}</div>
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    {selectedRole.name || selectedRole.key}
                    {selectedRole.is_master && (
                      <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-600">Master</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {selectedRole.description}
                  </CardDescription>
                  <Separator className="mt-3" />
                  <p className="text-xs text-muted-foreground mt-3">
                    {selectedRole.is_master
                      ? '🔒 Master possui acesso total — todas as permissões são concedidas automaticamente.'
                      : '✏️ Marque as permissões desejadas. Alterações são salvas automaticamente.'}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Módulo</th>
                      {actions?.map((a: any) => (
                        <th key={a.id} className="text-center py-2 px-1 font-medium text-muted-foreground text-xs whitespace-nowrap">
                          {a.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modules?.map((mod: any) => (
                      <tr key={mod.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2.5 px-2 font-medium">{mod.name}</td>
                        {actions?.map((act: any) => (
                          <td key={act.id} className="text-center py-2.5 px-1">
                            <Checkbox
                              checked={selectedRole.is_master || isAllowed(mod.id, act.id)}
                              disabled={selectedRole.is_master || toggleMutation.isPending}
                              onCheckedChange={() => handleToggle(mod.id, act.id)}
                              className="mx-auto"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-16 text-center">
              <Users className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">Selecione um perfil</p>
              <p className="text-xs text-muted-foreground mt-1">Escolha um perfil à esquerda para visualizar e editar suas permissões</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
