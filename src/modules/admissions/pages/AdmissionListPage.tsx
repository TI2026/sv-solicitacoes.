import { useAuth } from '@/contexts/AuthContext';
import { useAdmissionRequests } from '../hooks/useAdmissionQueries';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { ADMISSION_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import { Link, useNavigate } from 'react-router-dom';
import { PlusCircle, Loader2, UserPlus, Building2, Calendar, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdmissionListPage() {
  const { user, hasAnyRole } = useAuth();
  const { data: requests, isLoading } = useAdmissionRequests();
  const navigate = useNavigate();
  const canCreate = hasAnyRole(['diretoria', 'administrativo', 'rh']);

  // Realtime: auto-refresh list when admission_requests change
  useRealtimeSubscription({
    channelName: 'admissions-list-realtime',
    enabled: !!user,
    tables: [
      {
        table: 'admission_requests',
        queryKeys: [['admission_requests'], ['admission_metrics'], ['adm_all']],
      },
      {
        table: 'candidates',
        queryKeys: [['candidates']],
      },
    ],
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Admissões</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Processos de admissão</p>
        </div>
        {canCreate && (
          <Button onClick={() => navigate('/admissions/new')} className="gap-2">
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Admissão</span>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : !requests || requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserPlus className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma solicitação de admissão</p>
            {canCreate && <Button variant="outline" className="mt-4" onClick={() => navigate('/admissions/new')}>Criar Primeira</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req: any) => (
            <Link key={req.id} to={`/admissions/${req.id}`}>
              <Card className="hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{req.cargo_funcao || 'Cargo não definido'}</span>
                        <StatusBadge status={req.status} label={ADMISSION_STATUS_LABELS[req.status] || req.status} />
                        {req.priority === 'alta' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium status-rejected">
                            <AlertTriangle className="w-3 h-3" /> Alta
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{req.centro_custo || '—'}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(req.created_at).toLocaleDateString('pt-BR')}</span>
                        {req.profiles && <span>{req.profiles.full_name}</span>}
                        {req.salario_previsto && <span>R$ {Number(req.salario_previsto).toLocaleString('pt-BR')}</span>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
