import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { ROLE_LABELS } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Shield, Camera, Loader2, Lock, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/** Resize image to max dimensions using Canvas, returns JPEG blob */
async function resizeImage(file: File, maxSize = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      const min = Math.min(w, h);
      const sx = (w - min) / 2;
      const sy = (h - min) / 2;
      canvas.width = maxSize;
      canvas.height = maxSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, sx, sy, min, min, 0, 0, maxSize, maxSize);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Falha ao comprimir imagem')),
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => reject(new Error('Erro ao carregar imagem'));
    img.src = URL.createObjectURL(file);
  });
}

export default function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const passwordValid = newPassword.length >= 8 && /\d/.test(newPassword) && /[a-zA-Z]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword;

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

  const handleAvatarUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 5MB', variant: 'destructive' });
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast({ title: 'Tipo não permitido', description: 'Use JPG, PNG ou WebP', variant: 'destructive' });
      return;
    }
    setUploadingAvatar(true);
    try {
      const resized = await resizeImage(file, 512);
      const path = `${user.id}/avatar.jpg`;
      await supabase.storage.from('avatars').remove([path]);
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, resized, {
        upsert: true,
        contentType: 'image/jpeg',
      });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const avatarUrl = urlData.publicUrl + '?t=' + Date.now();
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);
      if (updateError) throw updateError;
      toast({ title: 'Foto atualizada!' });
      await refreshProfile();
    } catch (err: any) {
      toast({ title: 'Erro ao enviar foto', description: err.message, variant: 'destructive' });
    }
    setUploadingAvatar(false);
  };

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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid || !passwordsMatch || !currentPassword) return;
    setChangingPw(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email || '',
        password: currentPassword,
      });
      if (signInError) {
        toast({ title: 'Erro', description: 'Senha atual incorreta.', variant: 'destructive' });
        setChangingPw(false);
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        toast({ title: 'Erro', description: updateError.message, variant: 'destructive' });
        setChangingPw(false);
        return;
      }
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'password_changed',
        entity_type: 'auth',
        entity_id: user.id,
        details: { method: 'profile' },
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
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Profile Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative group">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.full_name} className="w-16 h-16 rounded-full object-cover border-2 border-primary/20" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-8 h-8 text-primary" />
                </div>
              )}
              <button onClick={() => fileRef.current?.click()} disabled={uploadingAvatar} className="absolute inset-0 rounded-full bg-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {uploadingAvatar ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { if (e.target.files?.[0]) handleAvatarUpload(e.target.files[0]); e.target.value = ''; }} />
            </div>
            <div>
              <CardTitle>Meu Perfil</CardTitle>
              <CardDescription>{primaryRole ? ROLE_LABELS[primaryRole] : 'Sem papel'} · {user.email}</CardDescription>
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

      {/* Security: Change Password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Alterar Senha</CardTitle>
              <CardDescription>Altere sua senha de acesso ao sistema</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="currentPw">Senha atual</Label>
              <div className="relative">
                <Input id="currentPw" type={showCurrentPw ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Digite sua senha atual" required />
                <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPw">Nova senha</Label>
              <div className="relative">
                <Input id="newPw" type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required />
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
              <Input id="confirmPw" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repita a nova senha" required />
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

      {/* Session Info */}
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
