import { useState } from 'react';
import { Check, Circle, Clock, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface StepDef {
  key: string;
  label: string;
  description: string;
  help: string;
  statusMatch: string[];
}

const STEPS: StepDef[] = [
  {
    key: 'vaga',
    label: '0. Vaga Criada',
    description: 'Definição do cargo, salário e requisitos.',
    help: 'Preencha os dados da vaga e envie para triagem.',
    statusMatch: ['rascunho', 'aguardando_triagem'],
  },
  {
    key: 'triagem',
    label: '1. Triagem + Candidatos',
    description: 'Cadastro de candidatos (mínimo 1).',
    help: 'O administrativo inicia a triagem e cadastra candidatos. Ao menos 1 é necessário para avançar.',
    statusMatch: ['em_triagem'],
  },
  {
    key: 'entrevista',
    label: '2. Entrevista',
    description: 'Agendamento e resultado da entrevista.',
    help: 'Agende data, hora, endereço e entrevistador. Após a data/hora, registre "Continuar" ou "Eliminar". Só aprovados avançam.',
    statusMatch: ['aguardando_documentos'],
  },
  {
    key: 'documentos',
    label: '3. Documentos (Link Externo)',
    description: 'Envio de documentos pelo candidato via link público.',
    help: 'Gere um link público para cada candidato. O candidato envia documentos pessoais, dados bancários e certidões. Confirme o recebimento para avançar.',
    statusMatch: ['documentos_em_analise'],
  },
  {
    key: 'exame',
    label: '4. Exame Admissional',
    description: 'Agendamento e resultado do exame médico.',
    help: 'Digite clínica, data e hora. Após a data, registre "Apto" ou "Inapto". Inaptos são eliminados.',
    statusMatch: ['aguardando_exame', 'exame_realizado'],
  },
  {
    key: 'assinatura',
    label: '5. Assinatura (Link Externo)',
    description: 'Admin envia docs internos, candidato assina via CDGov e reenvia.',
    help: 'Faça upload dos documentos internos (contrato, ficha de registro). Gere link para o candidato baixar, assinar no CDGov e reenviar. Confirme recebimento.',
    statusMatch: ['aguardando_registro'],
  },
  {
    key: 'admitido',
    label: '6. Admitido',
    description: 'Contratação confirmada.',
    help: 'Quando todos os passos estiverem completos, confirme a admissão.',
    statusMatch: ['registros_concluidos', 'concluido'],
  },
];

function getActiveStepIndex(status: string): number {
  for (let i = STEPS.length - 1; i >= 0; i--) {
    if (STEPS[i].statusMatch.includes(status)) return i;
  }
  return 0;
}

interface AdmissionStepperProps {
  status: string;
  candidateCount?: number;
  hasInterview?: boolean;
  hasDocuments?: boolean;
  hasExam?: boolean;
  hasRegistration?: boolean;
  className?: string;
}

export function AdmissionStepper({
  status,
  candidateCount = 0,
  hasInterview = false,
  hasDocuments = false,
  hasExam = false,
  hasRegistration = false,
  className,
}: AdmissionStepperProps) {
  const [helpOpen, setHelpOpen] = useState<string | null>(null);
  const activeIdx = getActiveStepIndex(status);
  const isCancelled = status === 'cancelado';
  const isArchived = status === 'arquivado';

  const getStepState = (idx: number) => {
    if (isCancelled || isArchived) return idx <= activeIdx ? 'done' : 'cancelled';
    if (idx < activeIdx) return 'done';
    if (idx === activeIdx) return 'current';
    return 'pending';
  };

  const getStepSummary = (key: string): string | null => {
    switch (key) {
      case 'triagem': return candidateCount > 0 ? `${candidateCount} candidato(s)` : null;
      case 'entrevista': return hasInterview ? 'Agendada' : null;
      case 'documentos': return hasDocuments ? 'Recebidos' : null;
      case 'exame': return hasExam ? 'Realizado' : null;
      case 'assinatura': return hasRegistration ? 'Completo' : null;
      default: return null;
    }
  };

  return (
    <div className={cn('space-y-1', className)}>
      {STEPS.map((step, idx) => {
        const state = getStepState(idx);
        const summary = getStepSummary(step.key);
        const isHelpOpen = helpOpen === step.key;

        return (
          <div key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center w-6">
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold',
                state === 'done' && 'bg-primary text-primary-foreground',
                state === 'current' && 'bg-primary/20 text-primary ring-2 ring-primary',
                state === 'pending' && 'bg-muted text-muted-foreground',
                state === 'cancelled' && 'bg-muted text-muted-foreground',
              )}>
                {state === 'done' ? <Check className="w-3.5 h-3.5" /> : state === 'current' ? <Clock className="w-3.5 h-3.5" /> : <Circle className="w-3 h-3" />}
              </div>
              {idx < STEPS.length - 1 && (
                <div className={cn('w-px flex-1 min-h-[16px]', state === 'done' ? 'bg-primary/40' : 'bg-border')} />
              )}
            </div>

            <div className="pb-3 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-sm font-medium',
                  state === 'done' && 'text-foreground',
                  state === 'current' && 'text-primary font-semibold',
                  state === 'pending' && 'text-muted-foreground',
                )}>{step.label}</span>
                {state === 'current' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">ATUAL</span>
                )}
                {summary && (
                  <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">{summary}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>

              <Collapsible open={isHelpOpen} onOpenChange={() => setHelpOpen(isHelpOpen ? null : step.key)}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 mt-1 text-[11px] text-muted-foreground gap-1 hover:text-primary">
                    <HelpCircle className="w-3 h-3" />
                    {isHelpOpen ? 'Fechar' : 'Ajuda'}
                    {isHelpOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-1.5 p-2.5 rounded-lg bg-muted/50 text-xs text-muted-foreground leading-relaxed">
                    {step.help}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        );
      })}
    </div>
  );
}
