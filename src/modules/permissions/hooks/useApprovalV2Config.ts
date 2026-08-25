/**
 * useApprovalV2Config.ts
 *
 * CAMADA: Hook
 *
 * Responsabilidade: React Query para a tela Configurações de Aprovação (Motor V2).
 * Padrão: Component → Hook (este arquivo) → Loader → Supabase
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  loadApprovalV2Health,
  loadSectorsWithResponsibles,
  loadV2CutoverStatus,
  saveStepAssignment,
  activateApprovalV2,
} from '../queries/approvalV2Loader';

const ASSIGNMENT_ERROR_LABELS: Record<string, string> = {
  FORBIDDEN_MASTER_ONLY: 'Apenas o perfil Master pode alterar a configuração de aprovação.',
  STEP_NOT_FOUND: 'Etapa não encontrada.',
  STEP_NOT_V2: 'Esta etapa pertence ao motor anterior (V1) e não pode ser alterada.',
  SUBSTITUTE_REQUIRED: 'Informe um substituto — o fluxo empresarial exige contingência.',
  INVALID_ASSIGNMENT_MODE: 'Tipo de responsável inválido.',
  INVALID_SLA: 'Prazo inválido. Informe um valor entre 1 e 8760 horas.',
  PRIMARY_REQUIRED: 'Selecione o responsável principal.',
  PRIMARY_INVALID_OR_INACTIVE: 'O responsável selecionado não existe ou está inativo.',
  SUBSTITUTE_EQUALS_PRIMARY: 'O substituto precisa ser diferente do responsável principal.',
  SUBSTITUTE_INVALID_OR_INACTIVE: 'O substituto selecionado não existe ou está inativo.',
  SECTOR_REQUIRED: 'Selecione o setor responsável.',
  SECTOR_INVALID_OR_INACTIVE: 'O setor selecionado não existe ou está inativo.',
  ACTIVATION_BLOCKED: 'Ativação bloqueada: ainda existem pendências de configuração ou solicitações do motor anterior.',
  V1_REQUESTS_ACTIVE: 'Existem solicitações do motor anterior em andamento. Conclua-as antes de ativar.',
  CONFIGURATION_NOT_READY: 'Configuração incompleta: todas as etapas precisam de responsável, substituto e prazo.',
  ACTIVATION_NO_RESULT: 'O servidor não retornou resultado para a ativação.',
};

export function useApprovalV2Health() {
  return useQuery({
    queryKey: ['approval_v2_health'],
    queryFn: loadApprovalV2Health,
    staleTime: 30_000,
  });
}

export function useV2CutoverStatus() {
  return useQuery({
    queryKey: ['approval_v2_cutover'],
    queryFn: loadV2CutoverStatus,
    staleTime: 30_000,
  });
}

export function useSectorsWithResponsibles() {
  return useQuery({
    queryKey: ['sectors_with_responsibles'],
    queryFn: loadSectorsWithResponsibles,
  });
}

export function useSaveStepAssignment() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: saveStepAssignment,
    onSuccess: async () => {
      await Promise.all([
        qc.refetchQueries({ queryKey: ['approval_v2_health'], type: 'active' }),
        qc.refetchQueries({ queryKey: ['approval_v2_cutover'], type: 'active' }),
      ]);
      toast({ title: 'Configuração da etapa salva' });
    },
    onError: (err: Error) => {
      toast({
        title: 'Não foi possível salvar',
        description: ASSIGNMENT_ERROR_LABELS[err.message] || err.message,
        variant: 'destructive',
      });
    },
  });
}

/** Cutover controlado do Motor V2 — mutation real (loading/success/error + invalidations). */
export function useActivateApprovalV2() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: activateApprovalV2,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['approval_v2_health'] });
      qc.invalidateQueries({ queryKey: ['approval_v2_cutover'] });
      qc.invalidateQueries({ queryKey: ['approval_context'] });
      qc.invalidateQueries({ queryKey: ['my_approvals'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
      toast({ title: res.message ?? 'Motor V2 ativado' });
    },
    onError: (err: Error) => {
      toast({
        title: 'Não foi possível ativar o Motor V2',
        description: ASSIGNMENT_ERROR_LABELS[err.message] || err.message,
        variant: 'destructive',
      });
    },
  });
}
