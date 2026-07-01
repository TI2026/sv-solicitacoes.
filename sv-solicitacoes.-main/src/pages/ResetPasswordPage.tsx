import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/logo.png';

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [checking, setChecking] = useState(true);

  const navigate = useNavigate();
  const { toast } = useToast();

  const passwordValid = newPassword.length >= 8 && /\d/.test(newPassword) && /[a-zA-Z]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword;

  useEffect(() => {
    // Supabase automatically handles the recovery token from the URL hash
    // and creates a session. We just need to wait for it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setHasSession(true);
        setChecking(false);
      }
    });

    // Also check if there's already a session (user may have landed here with a valid session)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setHasSession(true);
      }
      setChecking(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid || !passwordsMatch) return;
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
        setLoading(false);
        return;
      }

      // Get current user for audit log
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: 'password_reset_completed',
          entity_type: 'auth',
          entity_id: user.id,
          details: { method: 'email_link' },
        });
      }

      // Sign out so user logs in with new password
      await supabase.auth.signOut();
      setSuccess(true);
    } catch {
      toast({ title: 'Erro', description: 'Erro inesperado.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="SV Engenharia" className="w-20 h-20 rounded-full object-contain bg-white shadow-md border-2 border-primary/20 p-1 mb-4" />
          <h1 className="text-2xl font-bold text-foreground">SV Engenharia — Redefinição de Senha</h1>
        </div>

        <Card className="shadow-lg border-border">
          <CardHeader>
            <CardTitle className="text-xl">
              {success ? 'Senha redefinida!' : 'Redefinir senha'}
            </CardTitle>
            <CardDescription>
              {success
                ? 'Sua senha foi alterada com sucesso.'
                : 'Defina sua nova senha de acesso.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="space-y-4 text-center">
                <CheckCircle className="w-12 h-12 text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Faça login com sua nova senha.</p>
                <Button className="w-full" onClick={() => navigate('/login')}>
                  Ir para o login
                </Button>
              </div>
            ) : !hasSession ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-destructive">Link inválido ou expirado. Solicite um novo link de recuperação.</p>
                <Button variant="outline" className="w-full" onClick={() => navigate('/login')}>
                  Voltar ao login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPw">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="newPw"
                      type={showPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                      aria-pressed={showPw}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  </div>
                  {newPassword.length > 0 && !passwordValid && (
                    <p className="text-xs text-destructive">Mínimo 8 caracteres, 1 letra e 1 número.</p>
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

                <Button type="submit" className="w-full" disabled={loading || !passwordValid || !passwordsMatch}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Redefinir senha
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
