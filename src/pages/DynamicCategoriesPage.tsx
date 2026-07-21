import { useState } from 'react';
import { useDynamicCategories } from '@/hooks/useDynamicCategories';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Search, Trash2, Tag } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  module: string;
  fieldKey: string;
  title: string;
  description: string;
  isTab?: boolean;
}

export default function DynamicCategoriesPage({ module, fieldKey, title, description, isTab }: Props) {
  const [search, setSearch] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const { hasRole } = useAuth();
  const canManage = hasRole('diretoria') || hasRole('administrativo') || hasRole('master');

  const { categories, addCategory, removeCategory, isLoading, isAdding, isRemoving } = useDynamicCategories(module, fieldKey);

  const filtered = categories.filter(c => {
    if (!search) return true;
    return c.label.toLowerCase().includes(search.toLowerCase());
  });

  const handleAdd = async () => {
    if (!newLabel.trim() || newLabel.trim().length < 2) return;
    await addCategory(newLabel.trim());
    setNewLabel('');
  };

  return (
    <div className={`animate-fade-in ${isTab ? 'space-y-4' : 'space-y-6 max-w-5xl mx-auto pb-24'}`}>
      {!isTab && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Tag className="w-6 h-6 text-primary" /> {title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {description}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {canManage && (
          <div className="md:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Adicionar Novo</CardTitle>
                <CardDescription>Cadastre um novo item nesta lista</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Input 
                    placeholder="Nome do item..." 
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    maxLength={100}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  />
                </div>
                <Button 
                  className="w-full gap-2" 
                  onClick={handleAdd}
                  disabled={isAdding || !newLabel.trim() || newLabel.trim().length < 2}
                >
                  {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Adicionar
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        <div className={canManage ? "md:col-span-2" : "md:col-span-3"}>
          <Card>
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar..." 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  className="pl-9 h-9" 
                />
              </div>
            </CardHeader>
            <CardContent className="pt-4 p-0">
              {isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-8 px-4">
                  <EmptyState
                    icon={Search}
                    title="Nenhum item encontrado"
                    description={search ? 'Nenhum resultado para a busca atual.' : 'Adicione o primeiro item desta categoria.'}
                    className="border-none shadow-none"
                  />
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filtered.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                      <span className="font-medium text-sm">{c.label}</span>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => removeCategory(c.id)}
                          disabled={isRemoving}
                        >
                          {isRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
