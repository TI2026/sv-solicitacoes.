import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { User, Lock, Bell, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateUserProfile, changePassword } from '@/lib/store';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  // Notification preferences (stored locally)
  const [notifApproval, setNotifApproval] = useState(true);
  const [notifReject, setNotifReject] = useState(true);
  const [notifNewRequest, setNotifNewRequest] = useState(true);

  if (!user) return null;

  const handleSaveProfile = () => {
    if (!name.trim()) {
      toast({ title: 'Erro', description: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    updateUserProfile(user.id, { name: name.trim(), department: department.trim() });
    refreshUser();
    toast({ title: 'Sucesso', description: 'Perfil atualizado!' });
  };

  const handleChangePassword = () => {
    if (!currentPwd || !newPwd) {
      toast({ title: 'Erro', description: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }
    if (newPwd !== confirmPwd) {
      toast({ title: 'Erro', description: 'As senhas não coincidem', variant: 'destructive' });
      return;
    }
    if (newPwd.length < 6) {
      toast({ title: 'Erro', description: 'A nova senha deve ter pelo menos 6 caracteres', variant: 'destructive' });
      return;
    }
    const result = changePassword(user.id, currentPwd, newPwd);
    if (result.success) {
      toast({ title: 'Sucesso', description: 'Senha alterada!' });
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } else {
      toast({ title: 'Erro', description: result.error, variant: 'destructive' });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Profile Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle>Meu Perfil</CardTitle>
              <CardDescription>{ROLE_LABELS[user.role]} • {user.email}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
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
            <Label>Perfil de Acesso</Label>
            <Input value={ROLE_LABELS[user.role]} disabled className="bg-muted" />
          </div>
          <Button onClick={handleSaveProfile}>Salvar Alterações</Button>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Alterar Senha</CardTitle>
              <CardDescription>Mantenha sua conta segura</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Senha Atual</Label>
            <Input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nova Senha</Label>
              <Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Confirmar Nova Senha</Label>
              <Input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
            </div>
          </div>
          <Button onClick={handleChangePassword} variant="outline">Alterar Senha</Button>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Preferências de Notificação</CardTitle>
              <CardDescription>Escolha quais notificações receber</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Aprovações</p>
              <p className="text-xs text-muted-foreground">Notificar quando solicitação for aprovada</p>
            </div>
            <Switch checked={notifApproval} onCheckedChange={setNotifApproval} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Rejeições</p>
              <p className="text-xs text-muted-foreground">Notificar quando solicitação for rejeitada</p>
            </div>
            <Switch checked={notifReject} onCheckedChange={setNotifReject} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Novas Solicitações</p>
              <p className="text-xs text-muted-foreground">Notificar sobre novas solicitações</p>
            </div>
            <Switch checked={notifNewRequest} onCheckedChange={setNotifNewRequest} />
          </div>
        </CardContent>
      </Card>

      {/* Security */}
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
              <span className="text-muted-foreground">Último login</span>
              <span className="text-foreground">{new Date().toLocaleString('pt-BR')}</span>
            </div>
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
