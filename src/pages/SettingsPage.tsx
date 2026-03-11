import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { AppRole, ROLE_LABELS } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Navigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, Lock, Plus, Trash2, Users } from 'lucide-react';

// Only show these 3 roles in the UI
const VISIBLE_ROLES: AppRole[] = ['diretoria', 'administrativo', 'colaborador'];

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  department: string;
  roles: AppRole[];
}

export default function SettingsPage() {
  const { hasRole, user: currentUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useRealtimeSubscription({
    channelName: 'settings-realtime',
    enabled: !!currentUser,
    tables: [
      { table: 'profiles', queryKeys: [['settings_users']] },
      { table: 'user_roles', queryKeys: [['settings_users']] },
    ],
  });

  const fetchUsers = async () => {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, department')
      .order('created_at', { ascending: true });

    if (!profiles) return;

    const usersWithRoles: UserRow[] = await Promise.all(
      profiles.map(async (p) => {
        const { data: roles } = await supabase.rpc('get_user_roles', { _user_id: p.id });
        return { ...p, roles: (roles as AppRole[]) || [] };
      })
    );
    setUsers(usersWithRoles);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const addRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role });
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Papel ${ROLE_LABELS[role]} adicionado` });
      fetchUsers();
    }
  };

  const removeRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role', role);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Papel ${ROLE_LABELS[role]} removido` });
      fetchUsers();
    }
  };

  if (!hasRole('diretoria')) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-foreground">Configurações</h2>
        <p className="text-sm text-muted-foreground mt-1">Gerenciamento de usuários e permissões</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Usuários do Sistema</CardTitle>
              <CardDescription>{users.length} usuários cadastrados · 3 níveis: Diretoria, Administrativo, Colaborador</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {users.map(u => {
            // Only show/add visible roles (3 levels)
            const visibleUserRoles = u.roles.filter(r => VISIBLE_ROLES.includes(r));
            const availableRoles = VISIBLE_ROLES.filter(r => !u.roles.includes(r));

            return (
              <Card key={u.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {u.full_name || 'Sem nome'}
                        {u.id === currentUser?.id && <span className="text-xs text-muted-foreground ml-2">(você)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{u.email} · {u.department || '—'}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {visibleUserRoles.map(role => (
                        <span key={role} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {ROLE_LABELS[role]}
                          {u.id !== currentUser?.id && (
                            <button onClick={() => removeRole(u.id, role)} className="hover:text-destructive">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      ))}

                      {availableRoles.length > 0 && u.id !== currentUser?.id && (
                        <Select onValueChange={(v) => addRole(u.id, v as AppRole)}>
                          <SelectTrigger className="h-7 w-auto text-xs gap-1">
                            <Plus className="w-3 h-3" />
                            <SelectValue placeholder="Adicionar" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableRoles.map(r => (
                              <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
