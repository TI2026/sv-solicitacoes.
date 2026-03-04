import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ADMISSION_STATUS_LABELS, PRIORITY_LABELS, getPriorityVariant } from '@/lib/constants';
import { Pencil, MapPin, User, Calendar, Users, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdmissionListItem } from '../adapters/mapAdmissionListItem';

interface Props {
  item: AdmissionListItem;
  canEdit: boolean;
  canAdvance: boolean;
  canDelete: boolean;
  nextStatusLabel: string | null;
  onAdvance: (id: string) => void;
  onDelete: (id: string) => void;
  deleting?: boolean;
}

export function AdmissionProcessCard({ item, canEdit, canAdvance, canDelete, nextStatusLabel, onAdvance, onDelete, deleting }: Props) {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const priorityVariant = getPriorityVariant(item.prioridade);

  const handleCardClick = (e: React.MouseEvent) => {
    // Prevent navigation when clicking action buttons
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[role="button"]')) return;
    navigate(`/admissions/${item.id}`);
  };

  return (
    <>
      <Card
        className="hover:border-primary/30 transition-colors group cursor-pointer"
        onClick={handleCardClick}
      >
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

              {/* Footer */}
              <p className="text-[11px] text-muted-foreground/70">
                Criado em: {new Date(item.criado_em).toLocaleDateString('pt-BR')} – {item.criado_por}
              </p>
            </div>

            {/* Right: Actions */}
            <TooltipProvider delayDuration={200}>
              <div className="flex flex-col gap-1 shrink-0">
                {canEdit && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); navigate(`/admissions/${item.id}`); }}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Editar</TooltipContent>
                  </Tooltip>
                )}

                {canDelete && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Arquivar / Excluir vaga</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão da vaga</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A vaga <strong>{item.cargo}</strong> será arquivada (soft delete). O histórico será preservado. Deseja continuar?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                onDelete(item.id);
                setShowDeleteConfirm(false);
              }}
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
