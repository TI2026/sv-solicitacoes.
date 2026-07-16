import { useState } from 'react';
import { usePurchases } from '../hooks/usePurchases';
import { PurchaseList } from '../components/PurchaseList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingCart, Plus, Filter, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PurchaseFilters } from '../queries/purchaseLoader';

export default function PurchaseListPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<PurchaseFilters>({});
  
  const { data: purchases = [], isLoading, refetch } = usePurchases(filters);

  const handleFilterChange = (key: keyof PurchaseFilters, value: string) => {
    setFilters(prev => {
      const newFilters = { ...prev, [key]: value };
      if (!value || value === 'all') delete newFilters[key];
      return newFilters;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in pb-24 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-primary" />
            Compras
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie e acompanhe solicitações de compras.
          </p>
        </div>
        
        <Button onClick={() => navigate('/purchases/new')} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Solicitação
        </Button>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-card border rounded-lg p-4 flex flex-col md:flex-row gap-4 items-end">
        <div className="space-y-1 flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Filter className="w-3 h-3" /> Status
          </label>
          <Select 
            value={filters.status || 'all'} 
            onValueChange={(val) => handleFilterChange('status', val)}
          >
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="em_aprovacao">Em Aprovação</SelectItem>
              <SelectItem value="aprovado">Aprovado</SelectItem>
              <SelectItem value="retornado">Devolvido</SelectItem>
              <SelectItem value="aguardando_pagamento">Aguardando Pagamento</SelectItem>
              <SelectItem value="cancelado">Cancelado / Rejeitado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            Categoria
          </label>
          <Select 
            value={filters.category || 'all'} 
            onValueChange={(val) => handleFilterChange('category', val)}
          >
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Todas categorias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              <SelectItem value="ti">TI / Tecnologia</SelectItem>
              <SelectItem value="escritorio">Material de Escritório</SelectItem>
              <SelectItem value="servicos">Serviços Terceirizados</SelectItem>
              <SelectItem value="manutencao">Manutenção e Reparos</SelectItem>
              <SelectItem value="outros">Outros</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            Fornecedor
          </label>
          <Input 
            placeholder="Buscar por fornecedor..." 
            className="bg-background"
            value={filters.supplier || ''}
            onChange={(e) => handleFilterChange('supplier', e.target.value)}
          />
        </div>

        <Button variant="outline" size="icon" onClick={() => refetch()} title="Recarregar">
          <RefreshCcw className="w-4 h-4" />
        </Button>
      </div>

      <PurchaseList purchases={purchases} isLoading={isLoading} />
    </div>
  );
}
