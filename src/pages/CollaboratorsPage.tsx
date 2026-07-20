import { useState } from 'react';
import { useCollaborators } from '@/hooks/useCollaborators';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Users } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';

export default function CollaboratorsPage() {
  const [search, setSearch] = useState('');
  const { data: collaborators, isLoading } = useCollaborators({ includeProfiles: true });

  const filtered = (collaborators || []).filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.full_name?.toLowerCase().includes(s) ||
      c.matricula?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.sector?.name?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Colaboradores
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visualização de todos os colaboradores e perfis do sistema.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nome, matrícula, email..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="pl-9" 
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">Nenhum colaborador encontrado</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 px-3 font-medium text-muted-foreground">Nome</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Matrícula</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground hidden lg:table-cell">Email</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground">Setor</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground hidden sm:table-cell">Cargo</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="py-2.5 px-3 font-medium">
                        {c.full_name}
                        {c._isProfileOnly && <span className="ml-2 text-[10px] text-muted-foreground border px-1 rounded bg-muted/50">Perfil</span>}
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell font-mono text-xs text-muted-foreground">
                        {c.matricula || '—'}
                      </td>
                      <td className="py-2.5 px-3 hidden lg:table-cell text-muted-foreground">
                        {c.email || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {c.sector?.name || '—'}
                      </td>
                      <td className="py-2.5 px-3 hidden sm:table-cell">
                        {c.job_title || c.role_name || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {c.active === false ? (
                          <StatusBadge status="inativo" label="Inativo" />
                        ) : (
                          <StatusBadge status="ativo" label="Ativo" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
