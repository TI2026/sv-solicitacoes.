import { useAuth } from '@/contexts/AuthContext';
import { useFuelRequests } from '../hooks/useFleetQueries';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { FUEL_STATUS_LABELS } from '@/lib/constants';
import { Link, useNavigate } from 'react-router-dom';
import { PlusCircle, Loader2, Fuel, Calendar } from 'lucide-react';

export default function FleetListPage() {
  const { user, hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['diretoria', 'administrativo']);
  const { data: requests, isLoading } = useFuelRequests(user?.id, isAdmin);
  const navigate = useNavigate();

  // Realtime: auto-refresh list when fuel_requests change
  useRealtimeSubscription({
    channelName: 'fleet-list-realtime',
    enabled: !!user,
    tables: [
      {
        table: 'fuel_requests',
        queryKeys: [['fuel_requests'], ['fuel_metrics']],
      },
    ],
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Abastecimento / Reembolso</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdmin ? 'Todas as solicitações' : 'Suas solicitações'}
          </p>
        </div>
        <Button onClick={() => navigate('/fleet/new')} className="gap-2">
          <PlusCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Nova Solicitação</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : !requests || requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Fuel className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma solicitação encontrada</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/fleet/new')}>Criar Primeira</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req: any) => (
            <Link key={req.id} to={`/fleet/${req.id}`}>
              <Card className="hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          R$ {Number(req.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <StatusBadge status={req.status} label={FUEL_STATUS_LABELS[req.status] || req.status} />
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(req.data_abastecimento).toLocaleDateString('pt-BR')}
                        </span>
                        {isAdmin && req.profiles && (
                          <span>{req.profiles.full_name}</span>
                        )}
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
