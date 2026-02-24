import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getRequests, getRequestsByUser, getUserById } from '@/lib/store';
import { Request, REQUEST_TYPE_LABELS, STATUS_LABELS, STATUS_VARIANT, RequestStatus, RequestType } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, PlusCircle, Fuel, Receipt, Banknote, TrendingUp, Clock, CheckCircle2, XCircle } from 'lucide-react';

function StatusBadge({ status }: { status: RequestStatus }) {
  const variant = STATUS_VARIANT[status];
  const className = variant === 'approved' ? 'status-approved'
    : variant === 'rejected' ? 'status-rejected'
    : variant === 'info' ? 'status-info'
    : 'status-pending';
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>{STATUS_LABELS[status]}</span>;
}

function TypeIcon({ type }: { type: RequestType }) {
  if (type === 'FUEL') return <Fuel className="w-4 h-4 text-status-info" />;
  if (type === 'REIMBURSEMENT') return <Receipt className="w-4 h-4 text-status-pending" />;
  return <Banknote className="w-4 h-4 text-status-approved" />;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const allRequests = useMemo(() => {
    if (!user) return [];
    if (user.role === 'COLABORADOR') return getRequestsByUser(user.id);
    return getRequests();
  }, [user]);

  const filtered = useMemo(() => {
    return allRequests.filter(r => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && r.type !== typeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const solicitante = getUserById(r.solicitanteId);
        const matchPlaca = r.veiculoPlaca?.toLowerCase().includes(s);
        const matchCat = r.category?.toLowerCase().includes(s);
        const matchName = solicitante?.name.toLowerCase().includes(s);
        const matchStatus = STATUS_LABELS[r.status].toLowerCase().includes(s);
        if (!matchPlaca && !matchCat && !matchName && !matchStatus) return false;
      }
      return true;
    });
  }, [allRequests, search, statusFilter, typeFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = allRequests.length;
    const pending = allRequests.filter(r => !['CONCLUIDO', 'REJEITADO'].includes(r.status)).length;
    const completed = allRequests.filter(r => r.status === 'CONCLUIDO').length;
    const totalValue = allRequests.reduce((sum, r) => sum + r.valor, 0);
    return { total, pending, completed, totalValue };
  }, [allRequests]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-foreground">{stats.pending}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-status-pending-bg flex items-center justify-center">
                <Clock className="w-5 h-5 text-status-pending" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Concluídas</p>
                <p className="text-2xl font-bold text-foreground">{stats.completed}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-status-approved-bg flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-status-approved" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="text-2xl font-bold text-foreground">
                  {stats.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-status-info-bg flex items-center justify-center">
                <Banknote className="w-5 h-5 text-status-info" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por placa, categoria, nome..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os status</SelectItem>
                {(Object.keys(STATUS_LABELS) as RequestStatus[]).map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os tipos</SelectItem>
                {(Object.keys(REQUEST_TYPE_LABELS) as RequestType[]).map(t => (
                  <SelectItem key={t} value={t}>{REQUEST_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Link to="/nova-solicitacao">
              <Button className="w-full sm:w-auto gap-2">
                <PlusCircle className="w-4 h-4" /> Nova
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Request List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Nenhuma solicitação encontrada</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((r, i) => {
            const solicitante = getUserById(r.solicitanteId);
            return (
              <Link key={r.id} to={`/solicitacao/${r.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer group" style={{ animationDelay: `${i * 40}ms` }}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted shrink-0">
                        <TypeIcon type={r.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-foreground">{REQUEST_TYPE_LABELS[r.type]}</span>
                          {r.category && <span className="text-xs text-muted-foreground">• {r.category}</span>}
                          {r.veiculoPlaca && <span className="text-xs text-muted-foreground">• {r.veiculoPlaca}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{solicitante?.name || 'Desconhecido'}</span>
                          <span>•</span>
                          <span>{new Date(r.dataSolicitacao).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold text-foreground">
                          {r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
