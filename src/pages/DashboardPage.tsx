import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutDashboard, Users, FileText, Shield } from 'lucide-react';

export default function DashboardPage() {
  const { user, hasRole, hasAnyRole } = useAuth();

  if (!user) return null;

  const primaryRole = user.roles[0];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Olá, {user.full_name || 'Usuário'}!
        </h1>
        <p className="text-muted-foreground mt-1">
          Papel: <span className="font-medium text-foreground">{primaryRole ? ROLE_LABELS[primaryRole] : 'Sem papel definido'}</span>
          {user.department && <> · Departamento: <span className="font-medium text-foreground">{user.department}</span></>}
        </p>
      </div>

      {/* Quick stats placeholder */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Minhas Solicitações</p>
                <p className="text-2xl font-bold text-foreground">—</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {hasAnyRole(['diretoria', 'administrativo']) && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pendentes Revisão</p>
                  <p className="text-2xl font-bold text-foreground">—</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {hasRole('diretoria') && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Usuários</p>
                  <p className="text-2xl font-bold text-foreground">—</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <LayoutDashboard className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Módulos Ativos</p>
                <p className="text-2xl font-bold text-foreground">2</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sistema em construção</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Os módulos de <strong>Solicitação de Abastecimento/Reembolso</strong> e <strong>Fluxo de Admissão</strong> estão sendo implementados.
            Suas permissões ({user.roles.map(r => ROLE_LABELS[r]).join(', ')}) definirão o que você pode acessar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
