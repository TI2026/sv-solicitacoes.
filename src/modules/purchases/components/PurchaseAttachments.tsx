import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Paperclip, Upload, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import { PurchaseAttachment } from '../queries/purchaseLoader';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { validateFileMagicNumber, type AllowedFileType } from '@/lib/fileValidation';

const BUCKET = 'purchase-attachments';
const ALLOWED: AllowedFileType[] = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

interface Props {
  purchaseId: string;
  attachments: PurchaseAttachment[];
  canEdit?: boolean;
}

export function PurchaseAttachments({ purchaseId, attachments, canEdit = false }: Props) {
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['purchase', purchaseId] });
    qc.invalidateQueries({ queryKey: ['purchases'] });
  };

  const openSigned = async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast.error('Não foi possível abrir o anexo');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const persistAttachments = async (next: PurchaseAttachment[]) => {
    const { error } = await (supabase as any)
      .from('purchases')
      .update({ attachments: next })
      .eq('id', purchaseId);
    if (error) throw error;
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande', { description: 'Máximo 10MB' });
      e.target.value = '';
      return;
    }
    if (!ALLOWED.includes(file.type as AllowedFileType)) {
      toast.error('Tipo de arquivo não permitido', { description: 'Use JPEG, PNG, WebP ou PDF' });
      e.target.value = '';
      return;
    }
    const validMagic = await validateFileMagicNumber(file, ALLOWED);
    if (!validMagic) {
      toast.error('Arquivo inválido', { description: 'Extensão possivelmente forjada.' });
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const { data: signedData, error: fnError } = await supabase.functions.invoke('purchases-create-signed-upload', {
        body: { purchase_id: purchaseId, file_type: file.type, file_name: file.name, file_size: file.size },
      });
      if (fnError || (signedData as any)?.error) {
        throw new Error((signedData as any)?.error || fnError?.message || 'Erro ao gerar URL');
      }
      const { path, token } = signedData as { path: string; token: string };

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(path, token, file);
      if (uploadError) throw uploadError;

      const next: PurchaseAttachment[] = [
        ...attachments,
        { id: crypto.randomUUID(), name: file.name, path, uploaded_at: new Date().toISOString() },
      ];
      await persistAttachments(next);
      toast.success('Anexo enviado com sucesso!');
      invalidate();
    } catch (err: any) {
      toast.error('Erro no upload', { description: err.message });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemove = async (att: PurchaseAttachment) => {
    setRemovingId(att.id);
    try {
      await supabase.storage.from(BUCKET).remove([att.path]);
      await persistAttachments(attachments.filter((a) => a.id !== att.id));
      toast.success('Anexo removido');
      invalidate();
    } catch (err: any) {
      toast.error('Erro ao remover', { description: err.message });
    } finally {
      setRemovingId(null);
    }
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
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum anexo enviado.</p>
        ) : (
          <div className="space-y-2">
            {attachments.map((att) => (
              <div key={att.id} className="flex items-center justify-between p-2 border rounded-lg bg-muted/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{att.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {new Date(att.uploaded_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openSigned(att.path)} title="Abrir arquivo">
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemove(att)}
                      disabled={removingId === att.id}
                      title="Remover"
                    >
                      {removingId === att.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="pt-2 border-t">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
            <Button
              size="sm"
              variant="secondary"
              className="w-full h-8 gap-1"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Enviando...' : 'Enviar anexo'}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center mt-2">JPEG, PNG, WebP ou PDF · até 10MB</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
