import { useState } from 'react';
import { usePurchases } from '../hooks/usePurchases';
import { PurchaseList } from '../components/PurchaseList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingCart, Plus, Filter, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PurchaseFilters } from '../queries/purchaseLoader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DynamicCategoriesPage from '@/pages/DynamicCategoriesPage';
import { PageHeader } from '@/components/PageHeader';
import { FiltersBar } from '@/components/FiltersBar';

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
      <PageHeader
        icon={ShoppingCart}
        title="Compras"
        subtitle="Gerencie e acompanhe solicitações de compras."
        actions={(
          <Button onClick={() => navigate('/purchases/new')} className="gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Solicitação</span>
          </Button>
        )}
      />

      <Tabs defaultValue="solicitacoes" className="w-full">
        <TabsList className="w-full sm:w-auto mb-6">
          <TabsTrigger value="solicitacoes" className="gap-2">
            <ShoppingCart className="w-4 h-4" />
            Solicitações
          </TabsTrigger>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
          <TabsTrigger value="centros_custo">Centros de Custo</TabsTrigger>
        </TabsList>

        <TabsContent value="solicitacoes" className="space-y-6">

      {/* Barra de Filtros */}
      <FiltersBar>
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
      </FiltersBar>

      <PurchaseList purchases={purchases} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="categorias">
          <DynamicCategoriesPage 
            module="compras" 
            fieldKey="category" 
            title="Categorias" 
            description="Gerencie as categorias de compras do sistema." 
            isTab 
          />
        </TabsContent>

        <TabsContent value="fornecedores">
          <DynamicCategoriesPage 
            module="compras" 
            fieldKey="supplier" 
            title="Fornecedores" 
            description="Gerencie os fornecedores cadastrados." 
            isTab 
          />
        </TabsContent>

        <TabsContent value="centros_custo">
          <DynamicCategoriesPage 
            module="compras" 
            fieldKey="cost_center" 
            title="Centros de Custo" 
            description="Gerencie os centros de custo para rateio das compras." 
            isTab 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
