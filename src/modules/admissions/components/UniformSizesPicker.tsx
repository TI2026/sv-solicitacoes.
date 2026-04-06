import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Shirt } from 'lucide-react';
import { useEpiItems } from '@/modules/epis/hooks/useEpiQueries';

const CLOTHING_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'];
const SHOE_SIZES = Array.from({ length: 16 }, (_, i) => String(33 + i));

function getSizeOptions(item: any): string[] | null {
  const name = (item.name || '').toLowerCase();
  const notes = (item.notes || '').toLowerCase();
  // Detect shoe items
  if (name.includes('calçado') || name.includes('bota') || name.includes('sapato') || name.includes('tênis') || notes.includes('numeração')) {
    return SHOE_SIZES;
  }
  // Clothing items get standard sizes
  return CLOTHING_SIZES;
}

interface UniformSizesPickerProps {
  value: Record<string, string>; // { epi_item_id: size }
  onChange: (value: Record<string, string>) => void;
}

export function UniformSizesPicker({ value, onChange }: UniformSizesPickerProps) {
  const { data: epiItems, isLoading } = useEpiItems({ active: true });

  const sizedItems = (epiItems || []).filter((item: any) => item.size_required);

  const handleChange = (itemId: string, size: string) => {
    onChange({ ...value, [itemId]: size });
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando itens...</p>;
  }

  if (sizedItems.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum EPI cadastrado exige tamanho.</p>;
  }

  return (
    <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Shirt className="w-4 h-4" />
        Tamanhos por item ({sizedItems.length} itens exigem tamanho)
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sizedItems.map((item: any) => {
          const options = getSizeOptions(item);
          return (
            <div key={item.id} className="space-y-1">
              <Label className="text-xs truncate block" title={item.name}>
                {item.code ? `${item.code} - ` : ''}{item.name}
              </Label>
              {options ? (
                <Select value={value[item.id] || ''} onValueChange={v => handleChange(item.id, v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-8 text-xs"
                  value={value[item.id] || ''}
                  onChange={e => handleChange(item.id, e.target.value)}
                  placeholder="Informe o tamanho"
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Esses tamanhos serão associados ao colaborador quando contratado, facilitando a entrega de EPIs.
      </p>
    </div>
  );
}
