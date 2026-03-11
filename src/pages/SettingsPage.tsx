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

  const isDiretoria = hasRole('diretoria');

  // ── Change password state ──
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const passwordValid = newPassword.length >= 8 && /\d/.test(newPassword) && /[a-zA-Z]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid || !passwordsMatch || !currentPassword) return;
    setChangingPw(true);

    try {
      // Verify current password by re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentUser?.email || '',
        password: currentPassword,
      });
      if (signInError) {
        toast({ title: 'Erro', description: 'Senha atual incorreta.', variant: 'destructive' });
        setChangingPw(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        toast({ title: 'Erro', description: updateError.message, variant: 'destructive' });
        setChangingPw(false);
        return;
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: currentUser?.id,
        action: 'password_changed',
        entity_type: 'auth',
        entity_id: currentUser?.id || '',
        details: { method: 'settings' },
      });

      toast({ title: 'Senha alterada com sucesso.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast({ title: 'Erro', description: 'Erro inesperado.', variant: 'destructive' });
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-foreground">Configurações</h2>
        <p className="text-sm text-muted-foreground mt-1">Gerenciamento de conta e permissões</p>
      </div>

      {/* ── Security: Change Password ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Segurança</CardTitle>
              <CardDescription>Alterar sua senha de acesso</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="currentPw">Senha atual</Label>
              <div className="relative">
                <Input
                  id="currentPw"
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Digite sua senha atual"
                  required
                />
                <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPw">Nova senha</Label>
              <div className="relative">
                <Input
                  id="newPw"
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                />
                <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newPassword.length > 0 && !passwordValid && (
                <p className="text-xs text-destructive">A senha deve ter no mínimo 8 caracteres, 1 letra e 1 número.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPw">Confirmar nova senha</Label>
              <Input
                id="confirmPw"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                required
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-destructive">As senhas não coincidem.</p>
              )}
            </div>

            <Button type="submit" disabled={changingPw || !passwordValid || !passwordsMatch || !currentPassword}>
              {changingPw ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Alterar senha
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── User management (diretoria only) ── */}
      {isDiretoria && (
        <>
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
        </>
      )}
    </div>
  );
}
