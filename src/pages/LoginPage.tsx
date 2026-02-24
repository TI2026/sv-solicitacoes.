import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Fuel, Eye, EyeOff } from 'lucide-react';
import { UserRole, ROLE_LABELS } from '@/types';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('COLABORADOR');
  const [department, setDepartment] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    setTimeout(() => {
      if (isLogin) {
        const result = login(email, password);
        if (result.success) {
          navigate('/dashboard');
        } else {
          toast({ title: 'Erro', description: result.error, variant: 'destructive' });
        }
      } else {
        if (!name || !department) {
          toast({ title: 'Erro', description: 'Preencha todos os campos', variant: 'destructive' });
          setLoading(false);
          return;
        }
        const result = register(name, email, password, role, department);
        if (result.success) {
          navigate('/dashboard');
        } else {
          toast({ title: 'Erro', description: result.error, variant: 'destructive' });
        }
      }
      setLoading(false);
    }, 300);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
            <Fuel className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Gestão Corp</h1>
          <p className="text-sm text-muted-foreground mt-1">Controle de despesas corporativas</p>
        </div>

        <Card className="shadow-lg border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">{isLogin ? 'Entrar' : 'Criar conta'}</CardTitle>
            <CardDescription>
              {isLogin ? 'Acesse sua conta para continuar' : 'Preencha os dados para se registrar'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome completo</Label>
                    <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="role">Perfil</Label>
                      <Select value={role} onValueChange={v => setRole(v as UserRole)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="department">Departamento</Label>
                      <Input id="department" value={department} onChange={e => setDepartment(e.target.value)} placeholder="Ex: TI" required />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Aguarde...' : isLogin ? 'Entrar' : 'Criar conta'}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {isLogin ? 'Não tem conta? Criar agora' : 'Já tem conta? Fazer login'}
              </button>
            </div>

            {isLogin && (
              <div className="mt-6 p-3 rounded-lg bg-muted">
                <p className="text-xs font-medium text-muted-foreground mb-2">Contas de teste:</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p><span className="font-medium">Admin:</span> admin@gestcorp.com / admin123</p>
                  <p><span className="font-medium">Colaborador:</span> joao@gestcorp.com / 123456</p>
                  <p><span className="font-medium">Diretor:</span> carlos@gestcorp.com / 123456</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
