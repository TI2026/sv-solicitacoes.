import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Paperclip, Plus, Trash2, ExternalLink } from 'lucide-react';
import { PurchaseAttachment } from '../queries/purchaseLoader';
import { toast } from 'sonner';

// Permite apenas http/https absolutos — bloqueia javascript:, data:, vbscript:, file:, etc.
function isSafeHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

interface Props {
  attachments: PurchaseAttachment[];
  onUpdate?: (attachments: PurchaseAttachment[]) => void;
  readOnly?: boolean;
}

export function PurchaseAttachments({ attachments, onUpdate, readOnly = true }: Props) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');

  const handleAdd = () => {
    if (!name || !path || !onUpdate) return;

    if (!isSafeHttpUrl(path)) {
      toast.error('URL inválida', {
        description: 'Informe um link http:// ou https:// válido. Esquemas como javascript:, data: ou file: não são permitidos.',
      });
      return;
    }

    const newAttachment: PurchaseAttachment = {
      id: crypto.randomUUID(),
      name,
      path: path.trim(),
      uploaded_at: new Date().toISOString(),
    };
    
    onUpdate([...attachments, newAttachment]);
    setName('');
    setPath('');
  };

  const handleRemove = (id: string) => {
    if (!onUpdate) return;
    onUpdate(attachments.filter(a => a.id !== id));
  };

  return (
    <Card>
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-muted-foreground" />
          Anexos ({attachments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum anexo inserido.
          </p>
        ) : (
          <div className="space-y-2">
            {attachments.map(att => (
              <div key={att.id} className="flex items-center justify-between p-2 border rounded-lg bg-muted/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{att.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{att.path}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      if (!isSafeHttpUrl(att.path)) {
                        toast.error('Link bloqueado', { description: 'Este anexo não possui um endereço http(s) seguro.' });
                        return;
                      }
                      window.open(att.path, '_blank', 'noopener,noreferrer');
                    }}
                    title="Abrir arquivo"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  {!readOnly && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleRemove(att.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!readOnly && (
          <div className="bg-muted/50 p-3 rounded-lg border space-y-3 mt-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Adicionar URL / Arquivo Externo</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nome do Arquivo</Label>
                <Input size={1} className="h-8 text-sm" placeholder="Ex: Orçamento PDF" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">URL (Link público)</Label>
                <Input size={1} className="h-8 text-sm" placeholder="https://..." value={path} onChange={e => setPath(e.target.value)} />
              </div>
            </div>
            <Button size="sm" className="w-full h-8 gap-1" variant="secondary" onClick={handleAdd} disabled={!name || !path}>
              <Plus className="w-4 h-4" /> Anexar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
