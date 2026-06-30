import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Download, FileText, Loader2, Trash2 } from 'lucide-react';
import { validateFileMagicNumber } from '@/lib/fileValidation';

interface ExamAttachmentUploadProps {
  admissionId: string;
  candidateId: string;
}

export function ExamAttachmentUpload({ admissionId, candidateId }: ExamAttachmentUploadProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [files, setFiles] = useState<any[]>([]);

  const loadFiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('admission_files')
      .select('*')
      .eq('admission_request_id', admissionId)
      .eq('candidate_id', candidateId)
      .eq('link_type', 'EXAM')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Erro ao carregar anexos do exame',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setFiles(data || []);
  }, [admissionId, candidateId, toast]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const refreshAll = async () => {
    await loadFiles();
    await qc.invalidateQueries({ queryKey: ['admission_files', admissionId] });
    await qc.invalidateQueries({ queryKey: ['admission_files', admissionId, 'EXAM'] });
  };

  const handleUpload = async (file: File) => {
    if (uploading) return;

    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'] as const;
    if (!allowed.includes(file.type as any)) {
      toast({
        title: 'Tipo de arquivo não permitido',
        description: 'Aceitos: PDF, JPG, JPEG, PNG',
        variant: 'destructive',
      });
      return;
    }

    const isValidMagicNumber = await validateFileMagicNumber(file, allowed as any);
    if (!isValidMagicNumber) {
      toast({
        title: 'Arquivo inválido',
        description: 'O arquivo parece estar corrompido ou ter a extensão forjada.',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O limite é 10MB',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `exam/${admissionId}/${candidateId}/${Date.now()}-${sanitized}`;

      const { error: uploadError } = await supabase.storage
        .from('admissions')
        .upload(path, file);

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { error: insertError } = await supabase.from('admission_files').insert({
        admission_request_id: admissionId,
        candidate_id: candidateId,
        file_type: 'EXAME_ADICIONAL',
        storage_path: path,
        original_filename: sanitized,
        uploaded_by: 'ADMIN',
        link_type: 'EXAM',
      } as any);

      if (insertError) {
        // rollback do arquivo no storage se falhar ao registrar no banco
        await supabase.storage.from('admissions').remove([path]);

        throw new Error(insertError.message);
      }

      toast({ title: 'Exame anexado com sucesso!' });
      await refreshAll();
    } catch (err: any) {
      toast({
        title: 'Erro ao anexar exame',
        description: err.message || 'Falha inesperada ao anexar arquivo',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (storagePath: string) => {
    const { data, error } = await supabase.storage
      .from('admissions')
      .createSignedUrl(storagePath, 3600);

    if (error) {
      toast({
        title: 'Erro ao baixar arquivo',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  };

  const handleDelete = async (fileRow: any) => {
    const confirmed = window.confirm(
      `Deseja realmente excluir o arquivo "${fileRow.original_filename || 'exame'}"?`
    );

    if (!confirmed) return;

    setDeletingId(fileRow.id);

    try {
      // tenta apagar do storage primeiro
      const { error: storageError } = await supabase.storage
        .from('admissions')
        .remove([fileRow.storage_path]);

      // mesmo que o arquivo já não exista mais no storage, seguimos para limpar o banco
      if (storageError) {
        console.warn('Aviso ao excluir do storage:', storageError.message);
      }

      const { error: deleteError } = await supabase
        .from('admission_files')
        .delete()
        .eq('id', fileRow.id)
        .eq('admission_request_id', admissionId)
        .eq('candidate_id', candidateId)
        .eq('link_type', 'EXAM');

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      toast({ title: 'Arquivo excluído com sucesso!' });
      await refreshAll();
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir arquivo',
        description: err.message || 'Falha inesperada ao excluir arquivo',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-2 pt-2 border-t border-border mt-2">
      <Label className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
        <Upload className="w-3 h-3" /> Anexo do Exame Admissional
      </Label>

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 text-xs bg-muted/30 rounded px-2 py-2"
            >
              <span className="flex items-center gap-1 truncate min-w-0">
                <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="truncate">{f.original_filename || 'exame'}</span>
              </span>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => handleDownload(f.storage_path)}
                >
                  <Download className="w-3 h-3 mr-1" />
                  Baixar
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(f)}
                  disabled={deletingId === f.id}
                >
                  {deletingId === f.id ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3 mr-1" />
                  )}
                  Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          disabled={uploading}
          onChange={(e) => {
            if (e.target.files?.[0]) handleUpload(e.target.files[0]);
            e.target.value = '';
          }}
          className="text-xs h-8"
        />
        {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Aceitos: PDF, JPG, PNG (máx. 10MB)
      </p>
    </div>
  );
}