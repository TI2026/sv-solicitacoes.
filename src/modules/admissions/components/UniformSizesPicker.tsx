import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shirt, RotateCcw } from 'lucide-react';
import { useEpiItems } from '@/modules/epis/hooks/useEpiQueries';

const CLOTHING_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'];
const SHOE_SIZES = Array.from({ length: 16 }, (_, i) => String(33 + i));

function getSizeOptions(item: any): string[] {
  const name = (item.name || '').toLowerCase();
  const notes = (item.notes || '').toLowerCase();
  if (name.includes('calçado') || name.includes('bota') || name.includes('sapato') || name.includes('tênis') || notes.includes('numeração')) {
    return SHOE_SIZES;
  }
  return CLOTHING_SIZES;
}

interface UniformSizesPickerProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}

export function UniformSizesPicker({ value, onChange }: UniformSizesPickerProps) {
  const { data: epiItems, isLoading } = useEpiItems({ active: true });

  const sizedItems = (epiItems || []).filter((item: any) => item.size_required);

  // Group by category
  const grouped = sizedItems.reduce<Record<string, any[]>>((acc, item: any) => {
    const cat = item.category || 'Outros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const filledCount = sizedItems.filter((item: any) => value[item.id]).length;

  const handleChange = (itemId: string, size: string) => {
    onChange({ ...value, [itemId]: size });
  };

  const handleClear = (itemId: string) => {
    const next = { ...value };
    delete next[itemId];
    onChange(next);
  };

  const handleClearAll = () => onChange({});

  if (isLoading) {
    return <p className="text-sm text-muted-foreground animate-pulse">Carregando itens de EPI...</p>;
  }

  if (sizedItems.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-dashed text-center">
        <p className="text-sm text-muted-foreground">Nenhum EPI cadastrado exige tamanho.</p>
        <p className="text-xs text-muted-foreground mt-1">Cadastre itens com "Exige tamanho" em EPIs → Catálogo.</p>
      </div>
    );
  }

  const categories = Object.keys(grouped).sort();

  return (
    <div className="space-y-3 p-4 rounded-lg border bg-muted/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Shirt className="w-4 h-4 text-primary" />
          Tamanhos de EPI / Uniforme
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs font-normal">
            {filledCount}/{sizedItems.length} preenchidos
          </Badge>
          {filledCount > 0 && (
            <Button type="button" variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2" onClick={handleClearAll}>
              <RotateCcw className="w-3 h-3" /> Limpar
            </Button>
          )}
        </div>
      </div>

      {categories.map(cat => (
        <div key={cat} className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">
            {cat}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            {grouped[cat].map((item: any) => {
              const options = getSizeOptions(item);
              const selected = value[item.id] || '';
              return (
                <div key={item.id} className="flex items-center gap-2">
                  <Label className="text-xs truncate flex-1 min-w-0" title={item.name}>
                    {item.name}
                  </Label>
                  <div className="w-28 flex-shrink-0">
                    {options.length > 0 ? (
                      <Select value={selected} onValueChange={v => handleChange(item.id, v)}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="h-7 text-xs"
                        value={selected}
                        onChange={e => handleChange(item.id, e.target.value)}
                        placeholder="Tamanho"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Tamanhos serão vinculados ao colaborador e preenchidos automaticamente na entrega de EPIs.
      </p>
    </div>
  );
}
