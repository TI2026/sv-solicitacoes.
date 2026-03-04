import { useState } from 'react';
import { Check, Circle, Clock, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ADMISSION_STATUS_LABELS } from '@/lib/constants';

interface StepDef {
  key: string;
  label: string;
  description: string;
  help: string;
  statusMatch: string[]; // which admission statuses mean this step is "current" or "done"
}

const STEPS: StepDef[] = [
  {
    key: 'vaga',
    label: '1. Vaga Criada',
    description: 'Definição do cargo, salário e requisitos.',
    help: 'Preencha os dados da vaga: cargo, centro de custo, tipo de contrato, salário previsto, jornada e gestor responsável. Ao enviar, o processo segue para triagem.',
    statusMatch: ['rascunho', 'aguardando_triagem'],
  },
  {
    key: 'triagem',
    label: '2. Triagem',
    description: 'RH/Admin avalia a solicitação.',
    help: 'O RH revisa os dados da vaga e decide se prossegue. Após aprovação da triagem, é possível adicionar candidatos.',
    statusMatch: ['em_triagem'],
  },
  {
    key: 'candidatos',
    label: '3. Candidatos',
    description: 'Cadastro e seleção de candidatos.',
    help: 'Adicione até 8+ candidatos por vaga. Preencha nome, telefone, cidade e demais dados. Candidatos podem ser avançados para entrevista ou eliminados.',
    statusMatch: ['aguardando_documentos'],
  },
  {
    key: 'entrevista',
    label: '4. Entrevista',
    description: 'Agendamento e resultado da entrevista.',
    help: 'Agende data, hora, endereço e entrevistador. Após a entrevista, a diretoria confirma aprovação ou reprovação do candidato.',
    statusMatch: [],
  },
  {
    key: 'documentacao',
    label: '5. Documentação',
    description: 'Envio de documentos pelo candidato via link público.',
    help: 'Gere um link seguro (válido por 7 dias) e envie ao candidato. Ele faz upload de RG, CPF, CTPS, comprovante de residência e outros. O RH vê os docs chegando em tempo real.',
    statusMatch: ['documentos_em_analise'],
  },
  {
    key: 'exame',
    label: '6. Exame Admissional',
    description: 'Agendamento e resultado do exame.',
    help: 'Agende o exame em uma clínica parceira. A etapa fica pendente até o resultado. O RH registra: Apto, Apto com Restrição ou Inapto.',
    statusMatch: ['aguardando_exame', 'exame_realizado'],
  },
  {
    key: 'registros',
    label: '7. Registros Internos',
    description: 'Cadastros nos sistemas internos.',
    help: 'Checklist de cadastros: folha de pagamento, eSocial, ponto, sistema interno e entrega de EPI. Marque cada item conforme concluído.',
    statusMatch: ['aguardando_registro', 'registros_concluidos'],
  },
  {
    key: 'admitido',
    label: '8. Admitido',
    description: 'Contratação confirmada.',
    help: 'Quando todos os passos estiverem completos, confirme a admissão. O solicitante e envolvidos serão notificados.',
    statusMatch: ['concluido'],
  },
];

// Map status to step index (which step is the current one)
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

  // Determine step state based on context
  const getStepState = (idx: number) => {
    if (isCancelled) return idx <= activeIdx ? 'done' : 'cancelled';
    if (idx < activeIdx) return 'done';
    if (idx === activeIdx) return 'current';
    return 'pending';
  };

  // Extra info per step
  const getStepSummary = (key: string): string | null => {
    switch (key) {
      case 'candidatos': return candidateCount > 0 ? `${candidateCount} candidato(s)` : null;
      case 'entrevista': return hasInterview ? 'Agendada' : null;
      case 'documentacao': return hasDocuments ? 'Docs recebidos' : null;
      case 'exame': return hasExam ? 'Realizado' : null;
      case 'registros': return hasRegistration ? 'Completo' : null;
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
            {/* Vertical line + icon */}
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

            {/* Content */}
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

              {/* Help collapsible */}
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
