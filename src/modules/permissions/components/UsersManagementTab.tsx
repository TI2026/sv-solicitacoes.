import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, User, ChevronDown, ChevronUp, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUsersWithRoleAssignments, useRoles, useAssignUserRole, useUserEffectivePermissions } from '../hooks/usePermissionsData';

function EffectivePermissions({ userId }: { userId: string }) {
  const { data: perms, isLoading } = useUserEffectivePermissions(userId);

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin" />;

  if (!perms || perms.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Nenhuma permissão efetiva encontrada</p>;
  }

  // Group by module
  const grouped: Record<string, any[]> = {};
  perms.forEach((p: any) => {
    const modName = p.permission_modules?.name || 'Desconhecido';
    if (!grouped[modName]) grouped[modName] = [];
    grouped[modName].push(p);
  });

  return (
    <div className="space-y-2">
      {Object.entries(grouped).map(([mod, actions]) => (
        <div key={mod}>
          <p className="text-xs font-semibold text-foreground">{mod}</p>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {actions.map((a: any) => (
              <Badge key={a.id} variant="secondary" className="text-[10px] gap-1">
                {a.allowed ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <XCircle className="w-3 h-3 text-red-500" />}
                {a.permission_actions?.name}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function UsersManagementTab() {
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useUsersWithRoleAssignments();
  const { data: roles } = useRoles();
  const assignRole = useAssignUserRole();
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuários do Sistema</CardTitle>
          <CardDescription>{users?.length || 0} usuários cadastrados</CardDescription>
        </CardHeader>
      </Card>

      {users?.map((u: any) => {
        const assignment = u.assignments?.[0];
        const roleName = assignment?.roles?.name || assignment?.roles?.key || '—';
        const isMaster = assignment?.roles?.is_master;
        const isExpanded = expandedUser === u.id;

        return (
          <Card key={u.id}>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {u.full_name || 'Sem nome'}
                      {u.id === currentUser?.id && <span className="text-xs text-muted-foreground ml-2">(você)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {u.id !== currentUser?.id ? (
                    <Select
                      value={assignment?.role_id || ''}
                      onValueChange={(roleId) => {
                        if (currentUser?.id) {
                          assignRole.mutate({ userId: u.id, roleId, assignedBy: currentUser.id });
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 w-40 text-xs">
                        <SelectValue placeholder="Selecionar cargo" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles?.filter((r: any) => r.active).map((r: any) => (
                          <SelectItem key={r.id} value={r.id} className="text-xs">
                            {r.name || r.key}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="text-xs">{roleName}</Badge>
                  )}

                  {isMaster && <Badge className="bg-yellow-100 text-yellow-800 text-[10px]">Master</Badge>}

                  <button
                    onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                    className="text-muted-foreground hover:text-foreground p-1"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-3 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                    Permissões Efetivas
                  </p>
                  <EffectivePermissions userId={u.id} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
