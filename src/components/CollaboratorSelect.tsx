import * as React from 'react';
import { useCollaborators } from '@/hooks/useCollaborators';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, Loader2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface CollaboratorSelectProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  sectorId?: string; // Optional filter by sector
}

export function CollaboratorSelect({
  value,
  onChange,
  disabled,
  className,
  placeholder = 'Selecione um colaborador...',
  sectorId
}: CollaboratorSelectProps) {
  const [open, setOpen] = React.useState(false);
  const { data: collaborators, isLoading } = useCollaborators({ active: true, sector_id: sectorId });

  const selectedCollab = React.useMemo(() => 
    collaborators?.find((c) => c.id === value),
  [collaborators, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </span>
          ) : selectedCollab ? (
            <span className="truncate">{selectedCollab.full_name}</span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command filter={(value, search) => {
          if (!search) return 1;
          const searchLower = search.toLowerCase();
          const collab = collaborators?.find(c => c.id === value);
          if (!collab) return 0;
          const matchName = collab.full_name?.toLowerCase().includes(searchLower);
          const matchMatricula = collab.matricula?.toLowerCase().includes(searchLower);
          const matchSector = collab.sector?.name?.toLowerCase().includes(searchLower);
          const matchJobTitle = collab.job_title?.toLowerCase().includes(searchLower);
          if (matchName || matchMatricula || matchSector || matchJobTitle) return 1;
          return 0;
        }}>
          <CommandInput placeholder="Buscar por nome, matrícula, setor ou cargo..." />
          <CommandList>
            <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
            <CommandGroup>
              {collaborators?.map((collab) => (
                <CommandItem
                  key={collab.id}
                  value={collab.id}
                  onSelect={(currentValue) => {
                    onChange(currentValue === value ? '' : currentValue);
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 py-3"
                >
                  <div className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-muted/50",
                    value === collab.id ? "bg-primary/10 border-primary/20 text-primary" : "text-muted-foreground"
                  )}>
                    <User className="h-4 w-4" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{collab.full_name}</span>
                      {collab.matricula && (
                        <Badge variant="secondary" className="shrink-0 text-[10px] uppercase font-mono">
                          {collab.matricula}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground truncate">
                      {collab.sector?.name && <span className="truncate">{collab.sector.name}</span>}
                      {collab.sector?.name && collab.job_title && <span>•</span>}
                      {collab.job_title && <span className="truncate">{collab.job_title}</span>}
                    </div>
                  </div>
                  <Check
                    className={cn(
                      'ml-2 h-4 w-4 shrink-0',
                      value === collab.id ? 'opacity-100 text-primary' : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
