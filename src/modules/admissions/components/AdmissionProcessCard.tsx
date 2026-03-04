import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ADMISSION_STATUS_LABELS, PRIORITY_LABELS, getPriorityVariant } from '@/lib/constants';
import { Eye, FileText, Pencil, ChevronRight, MapPin, Wallet, User, Calendar, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdmissionListItem } from '../adapters/mapAdmissionListItem';

interface Props {
  item: AdmissionListItem;
  canEdit: boolean;
  canAdvance: boolean;
  nextStatusLabel: string | null;
  onAdvance: (id: string) => void;
}

const DOC_SEMAPHORE: Record<string, { dot: string; label: string }> = {
  completo: { dot: 'bg-emerald-500', label: 'Completo' },
  parcial: { dot: 'bg-amber-400', label: 'Parcial' },
  pendente: { dot: 'bg-red-500', label: 'Pendente' },
  sem_candidato: { dot: 'bg-muted-foreground/40', label: 'Sem candidato' },
};

export function AdmissionProcessCard({ item, canEdit, canAdvance, nextStatusLabel, onAdvance }: Props) {
  const navigate = useNavigate();
  const sem = DOC_SEMAPHORE[item.documentos_status] || DOC_SEMAPHORE.pendente;
  const priorityVariant = getPriorityVariant(item.prioridade);

  return (
    <Card className="hover:border-primary/30 transition-colors group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Left content */}
          <div className="flex-1 min-w-0 space-y-2.5">
            {/* Line 1: Title */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground truncate">
                {item.cargo} – {item.candidato_nome}
              </h3>
              {item.total_candidatos > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                  <Users className="w-3 h-3" />{item.total_candidatos}
                </span>
              )}
            </div>

            {/* Line 2: Quick info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 truncate">
                <MapPin className="w-3.5 h-3.5 shrink-0" /> Obra: {item.obra_local}
              </span>
              <span className="flex items-center gap-1.5 truncate">
                <Wallet className="w-3.5 h-3.5 shrink-0" /> CC: {item.centro_custo}
              </span>
            </div>

            {/* Line 3: Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={item.status} label={ADMISSION_STATUS_LABELS[item.status] || item.status} />
              <span className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
                priorityVariant === 'rejected' && 'status-rejected',
                priorityVariant === 'approved' && 'status-approved',
                priorityVariant === 'pending' && 'status-pending',
              )}>
                {PRIORITY_LABELS[item.prioridade] || item.prioridade}
              </span>
            </div>

            {/* Line 4: Metadata */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> {item.solicitante}
              </span>
              {item.inicio_previsto && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Início: {new Date(item.inicio_previsto).toLocaleDateString('pt-BR')}
                </span>
              )}
              {item.salario_previsto != null && (
                <span className="text-xs">R$ {item.salario_previsto.toLocaleString('pt-BR')}</span>
              )}
            </div>

            {/* Line 5: Document semaphore */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="w-3.5 h-3.5" />
              <span>Documentos:</span>
              <span className={cn('w-2 h-2 rounded-full', sem.dot)} />
              <span>{sem.label}</span>
            </div>

            {/* Footer */}
            <p className="text-[11px] text-muted-foreground/70">
              Criado em: {new Date(item.criado_em).toLocaleDateString('pt-BR')} – {item.criado_por}
            </p>
          </div>

          {/* Right: Actions */}
          <TooltipProvider delayDuration={200}>
            <div className="flex flex-col gap-1 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/admissions/${item.id}`)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ver detalhes</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/admissions/${item.id}?tab=documentos`)}>
                    <FileText className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Documentos</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canEdit} onClick={() => canEdit && navigate(`/admissions/${item.id}`)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{canEdit ? 'Editar' : 'Sem permissão para editar'}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-primary"
                    disabled={!canAdvance}
                    onClick={() => canAdvance && onAdvance(item.id)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{canAdvance && nextStatusLabel ? nextStatusLabel : 'Sem próxima etapa disponível'}</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
