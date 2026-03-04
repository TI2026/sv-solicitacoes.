import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { ADMISSION_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import { Link, useNavigate } from 'react-router-dom';
import { PlusCircle, UserPlus, Building2, Calendar, AlertTriangle, LayoutGrid, List } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdmissionProcessCard } from '../components/AdmissionProcessCard';
import { AdmissionsFiltersBar, type AdmissionsFilters } from '../components/AdmissionsFiltersBar';
import { mapAdmissionListItem, type AdmissionListItem } from '../adapters/mapAdmissionListItem';
import { canEditAdmission, canAdvanceAdmission, canDeleteAdmission, getNextStatus, getNextStatusLabel } from '../utils/admissionPermissions';
import { useAdmissionSetStatus } from '../hooks/useAdmissionQueries';

const PAGE_SIZE = 20;

function useAdmissionListItems(filters: AdmissionsFilters, page: number) {
  return useQuery({
    queryKey: ['admission_list_items', filters, page],
    queryFn: async () => {
      let q = supabase
        .from('vw_admissions_list_items' as any)
        .select('*')
        .neq('status', 'arquivado')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filters.status) q = q.eq('status', filters.status);
      if (filters.priority) q = q.eq('priority', filters.priority);
      if (filters.obra) q = q.eq('local_contratacao', filters.obra);
      if (filters.search) {
        q = q.or(`cargo_funcao.ilike.%${filters.search}%,candidato_nome.ilike.%${filters.search}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapAdmissionListItem);
    },
  });
}

function useObras() {
  return useQuery({
    queryKey: ['admission_obras'],
    queryFn: async () => {
      const { data } = await supabase
        .from('admission_requests')
        .select('local_contratacao')
        .neq('local_contratacao', '');
      const unique = [...new Set((data || []).map((r: any) => r.local_contratacao).filter(Boolean))];
      return unique.sort();
    },
    staleTime: 60_000,
  });
}

export default function AdmissionListPage() {
  const { user, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const canCreate = hasAnyRole(['diretoria', 'administrativo', 'rh']);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [filters, setFilters] = useState<AdmissionsFilters>({ status: '', priority: '', obra: '', search: '' });
  const [page, setPage] = useState(0);

  const { data: items, isLoading } = useAdmissionListItems(filters, page);
  const { data: obras = [] } = useObras();
  const setStatusMutation = useAdmissionSetStatus();

  useRealtimeSubscription({
    channelName: 'admissions-list-realtime',
    enabled: !!user,
    tables: [
      { table: 'admission_requests', queryKeys: [['admission_list_items'], ['admission_requests'], ['admission_metrics'], ['adm_all'], ['admission_obras']] },
      { table: 'candidates', queryKeys: [['admission_list_items'], ['candidates']] },
      { table: 'candidate_documents', queryKeys: [['admission_list_items']] },
      { table: 'status_history', queryKeys: [['admission_list_items']] },
    ],
  });

  const handleAdvance = useCallback((id: string) => {
    const item = items?.find(i => i.id === id);
    if (!item) return;
    const next = getNextStatus(item.status);
    if (!next) return;
    setStatusMutation.mutate({ requestId: id, toStatus: next });
  }, [items, setStatusMutation]);

  const handleDelete = useCallback((id: string) => {
    setStatusMutation.mutate({ requestId: id, toStatus: 'arquivado', reason: 'Vaga excluída pelo usuário' });
  }, [setStatusMutation]);

  const hasMore = (items?.length || 0) === PAGE_SIZE;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Admissões</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Processos de admissão</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center border rounded-lg overflow-hidden">
            <Button variant={viewMode === 'cards' ? 'default' : 'ghost'} size="icon" className="h-8 w-8 rounded-none" onClick={() => setViewMode('cards')}>
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === 'table' ? 'default' : 'ghost'} size="icon" className="h-8 w-8 rounded-none" onClick={() => setViewMode('table')}>
              <List className="w-4 h-4" />
            </Button>
          </div>
          {canCreate && (
            <Button onClick={() => navigate('/admissions/new')} className="gap-2">
              <PlusCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Nova Admissão</span>
            </Button>
          )}
        </div>
      </div>

      <AdmissionsFiltersBar filters={filters} onChange={f => { setFilters(f); setPage(0); }} obrasDisponiveis={obras} />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-36 rounded-lg" />)}
        </div>
      ) : !items || items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserPlus className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {filters.status || filters.search || filters.priority || filters.obra
                ? 'Nenhum resultado para os filtros selecionados'
                : 'Nenhuma solicitação de admissão'}
            </p>
            {canCreate && !filters.status && (
              <Button variant="outline" className="mt-4" onClick={() => navigate('/admissions/new')}>Criar Primeira</Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {items.map((item) => (
            <AdmissionProcessCard
              key={item.id}
              item={item}
              canEdit={canEditAdmission(user, item)}
              canAdvance={canAdvanceAdmission(user, item)}
              canDelete={canDeleteAdmission(user)}
              nextStatusLabel={getNextStatusLabel(item.status)}
              onAdvance={handleAdvance}
              onDelete={handleDelete}
              deleting={setStatusMutation.isPending}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link key={item.id} to={`/admissions/${item.id}`}>
              <Card className="hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{item.cargo}</span>
                        <StatusBadge status={item.status} label={ADMISSION_STATUS_LABELS[item.status] || item.status} />
                        {item.prioridade === 'alta' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium status-rejected">
                            <AlertTriangle className="w-3 h-3" /> Alta
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{item.obra_local}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(item.criado_em).toLocaleDateString('pt-BR')}</span>
                        <span>{item.solicitante}</span>
                        {item.salario_previsto && <span>R$ {item.salario_previsto.toLocaleString('pt-BR')}</span>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {(page > 0 || hasMore) && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span className="text-xs text-muted-foreground">Página {page + 1}</span>
          <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Próxima</Button>
        </div>
      )}
    </div>
  );
}
