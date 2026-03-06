import { useState, useMemo, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { CARGOS_PREDEFINIDOS } from '../constants/cargosList';
import { cn } from '@/lib/utils';

interface CargoComboboxProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}

export function CargoCombobox({ value, onChange, maxLength = 100, placeholder = 'Buscar ou digitar cargo...', className }: CargoComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setSearch(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return CARGOS_PREDEFINIDOS.slice(0, 20);
    const q = search.toLowerCase();
    return CARGOS_PREDEFINIDOS.filter(c => c.toLowerCase().includes(q)).slice(0, 20);
  }, [search]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <Input
        value={search}
        onChange={e => {
          const v = e.target.value.slice(0, maxLength);
          setSearch(v);
          onChange(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.map(cargo => (
            <button
              key={cargo}
              type="button"
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors',
                cargo === value && 'bg-accent/50 font-medium'
              )}
              onMouseDown={e => {
                e.preventDefault();
                onChange(cargo);
                setSearch(cargo);
                setOpen(false);
              }}
            >
              {cargo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
