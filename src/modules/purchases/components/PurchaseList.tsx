import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PurchaseRequest } from '../queries/purchaseLoader';
import { StatusBadge } from '@/components/StatusBadge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronRight, ShoppingCart, Send, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { QuickActionButton } from '@/components/QuickActionButton';

const PURCHASE_STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  em_aprovacao: 'Em Aprovação',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  cancelado: 'Cancelado',
  retornado: 'Devolvido',
  aguardando_pagamento: 'Ag. Pagamento'
};

interface Props {
  purchases: PurchaseRequest[];
  isLoading: boolean;
}

export function PurchaseList({ purchases, isLoading }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (purchases.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ShoppingCart className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma solicitação de compra encontrada.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {purchases.map(purchase => {
        const isOwner = purchase.requester_user_id === user?.id;
        const quickAction =
          isOwner && purchase.status === 'rascunho'
            ? { label: 'Enviar', icon: Send, tone: 'primary' as const }
            : isOwner && purchase.status === 'retornado'
              ? { label: 'Ajustar e reenviar', icon: RotateCcw, tone: 'warning' as const }
              : null;
        return (
          <div
            key={purchase.id}
            onClick={() => navigate(`/purchases/${purchase.id}`)}
            className="w-full text-left bg-card hover:bg-muted/50 border rounded-lg p-4 transition-colors group flex flex-col md:flex-row md:items-center gap-4 cursor-pointer"
          >
            <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="font-semibold text-foreground truncate">
                {purchase.description}
              </span>
              <StatusBadge 
                status={purchase.status} 
                label={PURCHASE_STATUS_LABELS[purchase.status] || purchase.status} 
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
              <span className="font-medium text-foreground">
                {formatCurrency(purchase.estimated_value)}
              </span>
              <span className="hidden md:inline text-border">•</span>
              <span className="capitalize">{purchase.category}</span>
              <span className="hidden md:inline text-border">•</span>
              <span>{purchase.supplier || 'Sem fornecedor'}</span>
              <span className="hidden md:inline text-border">•</span>
              <span>Criado em {format(new Date(purchase.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
            </div>
            </div>

            {quickAction ? (
              <QuickActionButton
                label={quickAction.label}
                icon={quickAction.icon}
                tone={quickAction.tone}
                onClick={(e) => { e.stopPropagation(); navigate(`/purchases/${purchase.id}`); }}
              />
            ) : (
              <div className="hidden md:flex items-center text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                <span className="text-sm mr-2">Ver detalhes</span>
                <ChevronRight className="w-5 h-5" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
