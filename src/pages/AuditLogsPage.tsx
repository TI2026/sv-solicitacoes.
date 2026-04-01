import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Navigate } from 'react-router-dom';
import { Loader2, Search, Shield, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { formatDateTimeBR } from '@/lib/dateUtils';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create: { label: 'Criação', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  update: { label: 'Atualização', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  status_change: { label: 'Mudança Status', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  soft_delete: { label: 'Exclusão', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  purge_test_data: { label: 'Limpeza', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  password_changed: { label: 'Senha Alterada', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  password_reset: { label: 'Senha Redefinida', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  epi_delivery: { label: 'Entrega EPI', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300' },
  epi_return: { label: 'Devolução EPI', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  approval_approve: { label: 'Aprovação', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  approval_reject: { label: 'Reprovação', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  approval_return: { label: 'Devolução', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  archive: { label: 'Arquivamento', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300' },
  download: { label: 'Download', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  role_change: { label: 'Alteração de Cargo', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' },
};

const ENTITY_LABELS: Record<string, string> = {
  fuel_requests: 'Solicitação',
  admission_requests: 'Admissão',
  epi_items: 'EPI',
  epi_deliveries: 'Entrega EPI',
  approval_request: 'Aprovação',
  auth: 'Autenticação',
  system: 'Sistema',
  candidates: 'Candidato',
  profiles: 'Perfil',
  collaborators: 'Colaborador',
};

function ActionBadge({ action }: { action: string }) {
  const info = ACTION_LABELS[action];
  if (info) {
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${info.color}`}>{info.label}</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground">{action}</span>;
}

function DetailsCell({ details }: { details: any }) {
  const [expanded, setExpanded] = useState(false);
  if (!details || Object.keys(details).length === 0) return <span className="text-muted-foreground">—</span>;

  const summary = Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');

  const hasMore = Object.keys(details).length > 3;

  return (
    <div className="max-w-xs">
      <p className="text-xs text-muted-foreground truncate">{summary}</p>
      {hasMore && (
        <>
          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1 mt-0.5" onClick={() => setExpanded(!expanded)}>
            {expanded ? <><ChevronUp className="w-3 h-3 mr-0.5" /> Menos</> : <><ChevronDown className="w-3 h-3 mr-0.5" /> Mais</>}
          </Button>
          {expanded && (
            <pre className="mt-1 text-[10px] bg-muted rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
              {JSON.stringify(details, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

export default function AuditLogsPage() {
  const { hasAnyRole, user } = useAuth();
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useRealtimeSubscription({
    channelName: 'audit-logs-realtime',
    enabled: !!user,
    tables: [{ table: 'audit_logs', queryKeys: [['audit_logs']] }],
  });

  // Fetch logs with profiles for user names
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit_logs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch profiles for user name mapping
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-map'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email');
      return data || [];
    },
    enabled: !!user,
  });

  const profileMap = useMemo(() => {
    const map: Record<string, string> = {};
    profiles.forEach((p: any) => { map[p.id] = p.full_name || p.email || p.id; });
    return map;
  }, [profiles]);

  // Unique entity types and actions for filters
  const entityTypes = useMemo(() => [...new Set(logs.map((l: any) => l.entity_type))].sort(), [logs]);
  const actions = useMemo(() => [...new Set(logs.map((l: any) => l.action))].sort(), [logs]);

  const filtered = useMemo(() => {
    return logs.filter((log: any) => {
      if (moduleFilter !== 'all' && log.entity_type !== moduleFilter) return false;
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (dateFrom && log.created_at < dateFrom) return false;
      if (dateTo && log.created_at > dateTo + 'T23:59:59') return false;
      if (search) {
        const s = search.toLowerCase();
        const userName = (profileMap[log.user_id] || '').toLowerCase();
        const details = log.details ? JSON.stringify(log.details).toLowerCase() : '';
        return userName.includes(s) || log.action.toLowerCase().includes(s) || log.entity_type.toLowerCase().includes(s) || details.includes(s) || (log.entity_id || '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [logs, search, moduleFilter, actionFilter, dateFrom, dateTo, profileMap]);

  if (!hasAnyRole(['diretoria', 'administrativo'])) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Log de Auditoria</h2>
          <p className="text-sm text-muted-foreground">Registro de todas as ações do sistema · {filtered.length} registros</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="w-4 h-4" /> Filtros
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por usuário, ação, entidade..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger><SelectValue placeholder="Entidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Entidades</SelectItem>
                {entityTypes.map(t => <SelectItem key={t} value={t}>{ENTITY_LABELS[t] || t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue placeholder="Ação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Ações</SelectItem>
                {actions.map(a => <SelectItem key={a} value={a}>{ACTION_LABELS[a]?.label || a}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="De" className="text-xs" />
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="Até" className="text-xs" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Data/Hora</TableHead>
                    <TableHead className="w-36">Usuário</TableHead>
                    <TableHead className="w-32">Ação</TableHead>
                    <TableHead className="w-28">Entidade</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        Nenhum registro encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((log: any) => (
                      <TableRow key={log.id} className="hover:bg-muted/30">
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                          {formatDateTimeBR(log.created_at)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="font-medium">{profileMap[log.user_id] || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <ActionBadge action={log.action} />
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {ENTITY_LABELS[log.entity_type] || log.entity_type}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DetailsCell details={log.details} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
