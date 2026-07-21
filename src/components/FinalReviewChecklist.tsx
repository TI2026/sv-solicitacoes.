import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ClipboardCheck } from 'lucide-react';

export interface ChecklistItem {
  id: string;
  label: string;
  hint?: string;
}

interface Props {
  title?: string;
  description?: string;
  items: ChecklistItem[];
  /** Render prop recebe `allChecked` para habilitar/desabilitar a ação. */
  children: (allChecked: boolean) => React.ReactNode;
}

/**
 * Painel padrão de "Conferência Final" — checklist estático que precisa ser
 * 100% marcado antes de habilitar a ação de conclusão. Estado é local
 * (frontend-only), sem persistência: reforço visual da governança operacional.
 */
export function FinalReviewChecklist({
  title = 'Conferência Final',
  description = 'Confirme os itens abaixo antes de concluir.',
  items,
  children,
}: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const allChecked = useMemo(
    () => items.length > 0 && items.every((it) => checked[it.id]),
    [items, checked],
  );

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2">
              <Checkbox
                id={`chk-${item.id}`}
                checked={!!checked[item.id]}
                onCheckedChange={(v) =>
                  setChecked((prev) => ({ ...prev, [item.id]: v === true }))
                }
                className="mt-0.5"
              />
              <label
                htmlFor={`chk-${item.id}`}
                className="text-sm leading-snug cursor-pointer select-none"
              >
                <span className="font-medium text-foreground">{item.label}</span>
                {item.hint && (
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {item.hint}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
        <div className="pt-2 border-t border-primary/10">{children(allChecked)}</div>
      </CardContent>
    </Card>
  );
}