import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useDynamicCategories } from '@/hooks/useDynamicCategories';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Trash2, Loader2 } from 'lucide-react';

interface DynamicCategorySelectProps {
  module: string;
  fieldKey: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function DynamicCategorySelect({ module, fieldKey, value, onValueChange, placeholder = 'Selecione' }: DynamicCategorySelectProps) {
  const { hasRole } = useAuth();
  const isDiretoria = hasRole('diretoria');
  const { categories, addCategory, removeCategory, isAdding, isRemoving } = useDynamicCategories(module, fieldKey);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const handleAdd = async () => {
    if (!newLabel.trim() || newLabel.trim().length < 2) return;
    await addCategory(newLabel.trim());
    setNewLabel('');
    setShowAddDialog(false);
  };

  const handleRemove = async (id: string) => {
    await removeCategory(id);
  };

  return (
    <>
      <div className="flex gap-2">
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger className="flex-1"><SelectValue placeholder={placeholder} /></SelectTrigger>
          <SelectContent>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isDiretoria && (
          <div className="flex gap-1">
            <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => setShowAddDialog(true)} title="Adicionar categoria">
              <Plus className="w-4 h-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => setShowManageDialog(true)} title="Gerenciar categorias">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adicionar Categoria</DialogTitle></DialogHeader>
          <Input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value.slice(0, 50))}
            placeholder="Nome da nova categoria"
            maxLength={50}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={isAdding || !newLabel.trim() || newLabel.trim().length < 2}>
              {isAdding && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage/Remove Dialog */}
      <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Gerenciar Categorias</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {categories.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma categoria</p>}
            {categories.map(c => (
              <div key={c.id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2">
                <span className="text-sm">{c.label}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-destructive hover:text-destructive"
                  onClick={() => handleRemove(c.id)}
                  disabled={isRemoving}
                >
                  {isRemoving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManageDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
