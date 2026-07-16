import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShoppingCart, FileText, CheckCircle2, User, Building, Calendar, DollarSign, Tag, AlertCircle } from 'lucide-react';
import { PurchaseRequest } from '../queries/purchaseLoader';
import { StatusBadge } from '@/components/StatusBadge';
import { ApprovalStatusBlock } from '@/components/ApprovalStatusBlock';
import { StatusTimeline } from '@/components/StatusTimeline';
import { PurchaseAttachments } from './PurchaseAttachments';
import { useApprovalRequestForReference, useApprovalRequestsForReference } from '@/hooks/useApprovalFlow';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  purchase: PurchaseRequest;
}

export function PurchaseDetails({ purchase }: Props) {
  const { data: approvalRequest } = useApprovalRequestForReference(purchase.id);
  const { data: previousCycles = [] } = useApprovalRequestsForReference(purchase.id);
  
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd 'de' MMMM 'de' yyyy, 'às' HH:mm", { locale: ptBR });
  };

  const PURCHASE_STATUS_LABELS: Record<string, string> = {
    rascunho: 'Rascunho',
    em_aprovacao: 'Em Aprovação',
    aprovado: 'Aprovado',
    rejeitado: 'Rejeitado',
    cancelado: 'Cancelado',
    retornado: 'Devolvido',
    aguardando_pagamento: 'Aguardando Pagamento'
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        
        {/* Bloco de Aprovação (Motor) */}
        {approvalRequest && (
          <ApprovalStatusBlock 
            approvalRequest={approvalRequest} 
            previousCycles={previousCycles} 
          />
        )}

        <Card>
          <CardHeader className="border-b bg-muted/20">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <ShoppingCart className="w-5 h-5 text-primary" />
                  Detalhes da Compra
                </CardTitle>
                <CardDescription className="mt-1.5">
                  ID: {purchase.id.split('-')[0].toUpperCase()}
                </CardDescription>
              </div>
              <StatusBadge status={purchase.status} label={PURCHASE_STATUS_LABELS[purchase.status] || purchase.status} />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Descrição</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{purchase.description}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                    <Tag className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Categoria</p>
                    <p className="text-sm text-muted-foreground mt-0.5 capitalize">{purchase.category}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                    <AlertCircle className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Prioridade</p>
                    <p className="text-sm text-muted-foreground mt-0.5 capitalize">{purchase.priority}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                    <DollarSign className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Valor Estimado</p>
                    <p className="text-lg font-semibold text-foreground">{formatCurrency(purchase.estimated_value)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                    <Building className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Fornecedor / C. Custo</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {purchase.supplier || 'Não informado'} 
                      {purchase.cost_center ? ` • ${purchase.cost_center}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                    <Calendar className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Criado em</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{formatDate(purchase.created_at)}</p>
                  </div>
                </div>
              </div>
            </div>

            {purchase.justification && (
              <div className="mt-6 pt-6 border-t">
                <h4 className="text-sm font-medium mb-2">Justificativa</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{purchase.justification}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <PurchaseAttachments attachments={purchase.attachments || []} readOnly={true} />

        <Card>
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
              Histórico
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <StatusTimeline 
              entityId={purchase.id} 
              entityType="purchases" 
              module="compras" 
              statusLabels={PURCHASE_STATUS_LABELS} 
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
