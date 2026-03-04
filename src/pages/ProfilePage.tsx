import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { ROLE_LABELS } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [saving, setSaving] = useState(false);

  useRealtimeSubscription({
    channelName: 'profile-realtime',
    enabled: !!user,
    tables: [
      { table: 'profiles', filter: user ? `id=eq.${user.id}` : undefined, queryKeys: [['profile']] },
      { table: 'user_roles', filter: user ? `user_id=eq.${user.id}` : undefined, queryKeys: [['user_roles']] },
    ],
  });

  if (!user) return null;

  const primaryRole = user.roles[0];

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      toast({ title: 'Erro', description: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), department: department.trim() })
      .eq('id', user.id);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Perfil atualizado!' });
      await refreshProfile();
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle>Meu Perfil</CardTitle>
              <CardDescription>
                {primaryRole ? ROLE_LABELS[primaryRole] : 'Sem papel'} · {user.email}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Departamento</Label>
              <Input value={department} onChange={e => setDepartment(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user.email} disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label>Papéis de Acesso</Label>
            <div className="flex flex-wrap gap-2">
              {user.roles.map(role => (
                <span key={role} className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                  {ROLE_LABELS[role]}
                </span>
              ))}
              {user.roles.length === 0 && (
                <span className="text-sm text-muted-foreground">Nenhum papel atribuído</span>
              )}
            </div>
          </div>
          <Button onClick={handleSaveProfile} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar Alterações
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Segurança</CardTitle>
              <CardDescription>Informações da sessão</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sessão ativa</span>
              <span className="text-primary font-medium">Ativa</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
