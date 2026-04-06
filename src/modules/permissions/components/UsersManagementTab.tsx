import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, ChevronDown, ChevronUp, CheckCircle2, XCircle, Building2, Users, Search, Filter } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useUsersWithRoleAssignments, useRoles, useAssignUserRole, useUserEffectivePermissions, useSectors, useProfiles, useUpdateUserOrgFields } from '../hooks/usePermissionsData';

function EffectivePermissions({ userId }: { userId: string }) {
  const { data: perms, isLoading } = useUserEffectivePermissions(userId);

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin" />;

  if (!perms || perms.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Nenhuma permissão efetiva encontrada</p>;
  }

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

function OrgFields({ userId, currentSectorId, currentManagerId }: { userId: string; currentSectorId: string | null; currentManagerId: string | null }) {
  const { data: sectors } = useSectors();
  const { data: profiles } = useProfiles();
  const updateOrg = useUpdateUserOrgFields();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
      <div>
        <Label className="text-xs flex items-center gap-1 mb-1"><Building2 className="w-3 h-3" /> Setor</Label>
        <Select
          value={currentSectorId || 'none'}
          onValueChange={(v) => updateOrg.mutate({ userId, sectorId: v === 'none' ? null : v, managerUserId: currentManagerId })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Nenhum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-xs">Nenhum</SelectItem>
            {sectors?.map((s: any) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs flex items-center gap-1 mb-1"><Users className="w-3 h-3" /> Gestor Imediato</Label>
        <Select
          value={currentManagerId || 'none'}
          onValueChange={(v) => updateOrg.mutate({ userId, sectorId: currentSectorId, managerUserId: v === 'none' ? null : v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Nenhum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-xs">Nenhum</SelectItem>
            {profiles?.filter((p: any) => p.id !== userId).map((p: any) => (
              <SelectItem key={p.id} value={p.id} className="text-xs">{p.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default function UsersManagementTab() {
  const { user: currentUser, refreshProfile } = useAuth();
  const { data: users, isLoading } = useUsersWithRoleAssignments();
  const { data: roles } = useRoles();
  const assignRole = useAssignUserRole();
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const handleRoleChange = async (userId: string, roleId: string) => {
    if (!currentUser?.id) return;
    await assignRole.mutateAsync({ userId, roleId, assignedBy: currentUser.id });
    // If changing own role, refresh auth context
    if (userId === currentUser.id) {
      setTimeout(() => refreshProfile(), 500);
    }
  };

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
        const sectorName = u.sector_id ? '' : null; // Will be resolved in expanded view

        return (
          <Card key={u.id}>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="w-9 h-9 shrink-0">
                    {u.avatar_url ? (
                      <AvatarImage src={u.avatar_url} alt={u.full_name || 'Avatar'} />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {(u.full_name || '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
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
                      onValueChange={(roleId) => handleRoleChange(u.id, roleId)}
                      disabled={assignRole.isPending}
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

                  {assignRole.isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}

                  <button
                    onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                    className="text-muted-foreground hover:text-foreground p-1"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-3 border-t border-border space-y-4">
                  {/* Org fields: sector + manager */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Dados Organizacionais
                    </p>
                    <OrgFields
                      userId={u.id}
                      currentSectorId={u.sector_id}
                      currentManagerId={u.manager_user_id}
                    />
                    {!u.sector_id && (
                      <p className="text-xs text-amber-600 mt-1">⚠ Sem setor — aprovações por setor não funcionarão para este usuário.</p>
                    )}
                    {!u.manager_user_id && (
                      <p className="text-xs text-amber-600 mt-1">⚠ Sem gestor imediato — aprovações por gestor não funcionarão para este usuário.</p>
                    )}
                  </div>

                  {/* Effective permissions */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Permissões Efetivas
                    </p>
                    <EffectivePermissions userId={u.id} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
