import { useEffect, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { ADMISSION_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';

export interface AdmissionsFilters {
  status: string;
  priority: string;
  obra: string;
  search: string;
}

const EMPTY: AdmissionsFilters = { status: '', priority: '', obra: '', search: '' };

interface Props {
  filters: AdmissionsFilters;
  onChange: (f: AdmissionsFilters) => void;
  obrasDisponiveis: string[];
}

export function AdmissionsFiltersBar({ filters, onChange, obrasDisponiveis }: Props) {
  const [searchLocal, setSearchLocal] = useState(filters.search);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchLocal !== filters.search) onChange({ ...filters, search: searchLocal });
    }, 300);
    return () => clearTimeout(t);
  }, [searchLocal]);

  const set = useCallback((key: keyof AdmissionsFilters, val: string) => {
    onChange({ ...filters, [key]: val === '__all__' ? '' : val });
  }, [filters, onChange]);

  const hasFilters = filters.status || filters.priority || filters.obra || filters.search;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar cargo ou candidato..."
          className="pl-8 h-9 text-sm"
          value={searchLocal}
          onChange={e => setSearchLocal(e.target.value)}
        />
      </div>

      {/* Status */}
      <Select value={filters.status || '__all__'} onValueChange={v => set('status', v)}>
        <SelectTrigger className="w-[160px] h-9 text-sm">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todos os status</SelectItem>
          {Object.entries(ADMISSION_STATUS_LABELS).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Priority */}
      <Select value={filters.priority || '__all__'} onValueChange={v => set('priority', v)}>
        <SelectTrigger className="w-[130px] h-9 text-sm">
          <SelectValue placeholder="Prioridade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todas</SelectItem>
          {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Obra */}
      {obrasDisponiveis.length > 0 && (
        <Select value={filters.obra || '__all__'} onValueChange={v => set('obra', v)}>
          <SelectTrigger className="w-[160px] h-9 text-sm">
            <SelectValue placeholder="Obra" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as obras</SelectItem>
            {obrasDisponiveis.map(o => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Clear */}
      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-9 gap-1 text-xs" onClick={() => { onChange(EMPTY); setSearchLocal(''); }}>
          <X className="w-3.5 h-3.5" /> Limpar
        </Button>
      )}
    </div>
  );
}
