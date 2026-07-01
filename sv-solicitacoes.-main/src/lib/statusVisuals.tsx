import type { ComponentType, SVGProps } from 'react';
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  DollarSign,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Landmark,
  Lock,
  ShieldAlert,
  Undo2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

/**
 * Mapeamento centralizado de status × cor × ícone para uso em badges,
 * timelines e botões. Os 13 status do módulo Frota/Solicitações são cobertos.
 * Cores baseadas em tokens Tailwind utilitários (não usar cores cruas em
 * componentes — atualize aqui se a paleta evoluir).
 */
export interface StatusVisual {
  label: string;
  Icon: LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;
  /** Classes Tailwind para o badge (bg + texto + borda). */
  badgeClass: string;
  /** Tom semântico para timelines e ícones isolados. */
  tone:
    | 'neutral'
    | 'info'
    | 'warning'
    | 'attention'
    | 'progress'
    | 'success'
    | 'success-strong'
    | 'danger'
    | 'archived';
}

const VISUALS: Record<string, StatusVisual> = {
  rascunho: {
    label: 'Rascunho',
    Icon: FileText,
    badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200',
    tone: 'neutral',
  },
  enviado: {
    label: 'Enviado',
    Icon: ArrowRight,
    badgeClass: 'bg-sky-100 text-sky-800 border border-sky-200',
    tone: 'info',
  },
  em_revisao: {
    label: 'Em Revisão',
    Icon: Eye,
    badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200',
    tone: 'warning',
  },
  em_revisao_admin: {
    label: 'Em Revisão Admin',
    Icon: ShieldAlert,
    badgeClass: 'bg-amber-200 text-amber-900 border border-amber-300',
    tone: 'attention',
  },
  em_aprovacao: {
    label: 'Em Aprovação',
    Icon: Lock,
    badgeClass: 'bg-purple-100 text-purple-800 border border-purple-200',
    tone: 'progress',
  },
  retornado: {
    label: 'Retornado',
    Icon: Undo2,
    badgeClass: 'bg-orange-100 text-orange-800 border border-orange-200',
    tone: 'warning',
  },
  aprovado: {
    label: 'Aprovado',
    Icon: CheckCircle2,
    badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    tone: 'success',
  },
  aguardando_fotos: {
    label: 'Aguardando Fotos',
    Icon: Eye,
    badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200',
    tone: 'warning',
  },
  aguardando_oc: {
    label: 'Aguardando OC',
    Icon: FileSpreadsheet,
    badgeClass: 'bg-cyan-100 text-cyan-800 border border-cyan-200',
    tone: 'info',
  },
  aguardando_pagamento: {
    label: 'Aguardando Pagamento',
    Icon: Landmark,
    badgeClass: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
    tone: 'progress',
  },
  pago: {
    label: 'Pago',
    Icon: DollarSign,
    badgeClass: 'bg-green-100 text-green-800 border border-green-200',
    tone: 'success',
  },
  concluido: {
    label: 'Concluído',
    Icon: FileCheck2,
    badgeClass: 'bg-green-200 text-green-900 border border-green-300',
    tone: 'success-strong',
  },
  reprovado: {
    label: 'Reprovado',
    Icon: XCircle,
    badgeClass: 'bg-red-100 text-red-800 border border-red-200',
    tone: 'danger',
  },
  encerrado: {
    label: 'Encerrado',
    Icon: Archive,
    badgeClass: 'bg-slate-200 text-slate-800 border border-slate-300',
    tone: 'archived',
  },
  ativa: {
    label: 'Ativa',
    Icon: CheckCircle2,
    badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    tone: 'success',
  },
};

const FALLBACK: StatusVisual = {
  label: '—',
  Icon: FileText,
  badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200',
  tone: 'neutral',
};

export function getStatusVisual(status: string | null | undefined): StatusVisual {
  if (!status) return FALLBACK;
  return VISUALS[status] ?? FALLBACK;
}