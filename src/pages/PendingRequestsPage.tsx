/**
 * PendingRequestsPage.tsx
 *
 * Centro operacional de aprovações. Reaproveita widgets existentes
 * (MyQueueWidget + CriticalPendingWidget) — não cria hooks, queries
 * ou componentes paralelos.
 */
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { MyQueueWidget } from '@/modules/dashboard/components/MyQueueWidget';
import { CriticalPendingWidget } from '@/modules/dashboard/components/CriticalPendingWidget';

export default function PendingRequestsPage() {
  const { user, hasAnyRole } = useAuth();
  const canManage = hasAnyRole(['diretoria', 'administrativo', 'supervisor']);
  const isApprovalUser = !!user && user.roles.some(r => r !== 'colaborador');

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-primary" />
          Pendências
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Solicitações aguardando aprovação, devolvidas ou com anomalias operacionais.
        </p>
      </div>

      {isApprovalUser && (
        <section aria-labelledby="pend-fila" className="space-y-3">
          <h2 id="pend-fila" className="text-lg font-semibold text-foreground border-b pb-2">
            Minha Fila de Aprovação
          </h2>
          <MyQueueWidget userId={user.id} />
        </section>
      )}

      <section aria-labelledby="pend-criticas" className="space-y-3">
        <h2 id="pend-criticas" className="text-lg font-semibold text-foreground border-b pb-2">
          Pendências Críticas
        </h2>
        <CriticalPendingWidget canManage={canManage} />
      </section>
    </div>
  );
}