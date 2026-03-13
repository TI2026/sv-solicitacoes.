import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Crown, Shield, ChevronRight } from 'lucide-react';
import { useRoles, usePermissionModules, usePermissionActions, useRolePermissionMatrix, useToggleRolePermission } from '../hooks/usePermissionsData';

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Roles List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Cargos</h3>
        {roles?.map((role: any) => (
          <Card
            key={role.id}
            className={`cursor-pointer transition-all hover:shadow-md ${selectedRoleId === role.id ? 'ring-2 ring-primary border-primary' : ''}`}
            onClick={() => setSelectedRoleId(role.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {role.is_master ? (
                    <Crown className="w-4 h-4 text-yellow-500" />
                  ) : (
                    <Shield className="w-4 h-4 text-primary" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{role.name || role.key}</p>
                    <p className="text-xs text-muted-foreground">{role.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {role.is_master && <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-600">Master</Badge>}
                  {role.is_system && <Badge variant="secondary" className="text-[10px]">Sistema</Badge>}
                  {!role.active && <Badge variant="destructive" className="text-[10px]">Inativo</Badge>}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Permission Matrix */}
      <div className="lg:col-span-2">
        {selectedRole ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                {selectedRole.is_master ? <Crown className="w-5 h-5 text-yellow-500" /> : <Shield className="w-5 h-5 text-primary" />}
                <div>
                  <CardTitle className="text-base">
                    Permissões: {selectedRole.name || selectedRole.key}
                  </CardTitle>
                  <CardDescription>
                    {selectedRole.is_master
                      ? 'Master possui acesso total — todas as permissões são concedidas automaticamente.'
                      : 'Marque as permissões para este cargo. As alterações são salvas automaticamente.'}
                  </CardDescription>
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
              <Shield className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Selecione um cargo para editar suas permissões</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
