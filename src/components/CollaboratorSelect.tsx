import * as React from 'react';
import { useCollaborators } from '@/hooks/useCollaborators';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { ChevronsUpDown, Loader2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface CollaboratorSelectProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  sectorId?: string; // Optional filter by sector
  includeProfiles?: boolean;
}

export function CollaboratorSelect({
  value,
  onChange,
  disabled,
  className,
  placeholder = 'Selecione um colaborador...',
  sectorId,
  includeProfiles
}: CollaboratorSelectProps) {
  const [open, setOpen] = React.useState(false);
  const { data: collaborators, isLoading } = useCollaborators({ active: true, sector_id: sectorId, includeProfiles });

  const selectedCollab = React.useMemo(() => 
    collaborators?.find((c) => c.id === value),
  [collaborators, value]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal bg-card text-left h-auto py-2.5 px-3',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <div className="flex flex-col gap-0.5 items-start overflow-hidden flex-1">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </span>
            ) : selectedCollab ? (
              <>
                <span className="truncate font-medium w-full">{selectedCollab.full_name}</span>
                <span className="text-xs text-muted-foreground truncate w-full">
                  {selectedCollab.job_title || 'Sem cargo'} 
                  {selectedCollab.sector?.name ? ` • ${selectedCollab.sector.name}` : ''}
                </span>
              </>
            ) : (
              <span>{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-[450px] p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle>Selecionar Colaborador</SheetTitle>
          <SheetDescription>Busque e selecione o colaborador desejado na lista abaixo.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <Command 
            className="flex flex-col h-full rounded-none"
            filter={(value, search) => {
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
            }}
          >
            <div className="px-3 py-2 border-b">
              <CommandInput placeholder="Buscar por nome, matrícula, setor ou cargo..." className="border-none focus:ring-0" />
            </div>
            <CommandList className="flex-1 overflow-y-auto p-2">
              <CommandEmpty className="p-6 text-center text-sm text-muted-foreground">Nenhum colaborador encontrado.</CommandEmpty>
              <CommandGroup>
                {collaborators?.map((collab) => (
                  <CommandItem
                    key={collab.id}
                    value={collab.id}
                    onSelect={(currentValue) => {
                      onChange(currentValue === value ? '' : currentValue);
                      setOpen(false);
                    }}
                    className="flex items-center gap-4 p-3 mb-1 cursor-pointer rounded-lg hover:bg-muted/50 data-[selected=true]:bg-muted"
                  >
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm",
                      value === collab.id ? "bg-primary/10 border-primary/20 text-primary" : "text-muted-foreground"
                    )}>
                      <User className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col overflow-hidden gap-1 flex-1">
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="font-semibold text-sm truncate">{collab.full_name}</span>
                        {collab.matricula && (
                          <Badge variant="secondary" className="shrink-0 text-[10px] uppercase font-mono px-1.5 h-4 leading-3">
                            {collab.matricula}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center text-xs text-muted-foreground gap-1 sm:gap-2">
                        {collab.sector?.name && <span className="truncate">{collab.sector.name}</span>}
                        {collab.sector?.name && collab.job_title && <span className="hidden sm:inline">•</span>}
                        {collab.job_title && <span className="truncate">{collab.job_title}</span>}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </SheetContent>
    </Sheet>
  );
}
