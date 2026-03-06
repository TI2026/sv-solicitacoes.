import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Download, FileText, Loader2, Trash2 } from 'lucide-react';

interface ExamAttachmentUploadProps {
  admissionId: string;
  candidateId: string;
}

export function ExamAttachmentUpload({ admissionId, candidateId }: ExamAttachmentUploadProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadFiles = async () => {
    const { data } = await supabase
      .from('admission_files')
      .select('*')
      .eq('admission_request_id', admissionId)
      .eq('candidate_id', candidateId)
      .eq('link_type', 'EXAM')
      .order('created_at', { ascending: false });
    setFiles(data || []);
    setLoaded(true);
  };

  if (!loaded) loadFiles();

  const handleUpload = async (file: File) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowed.includes(file.type)) {
      toast({ title: 'Tipo de arquivo não permitido', description: 'Aceitos: PDF, JPG, JPEG, PNG', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande (máx. 10MB)', variant: 'destructive' });
      return;
    }
    setUploading(true);
    const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `exam/${admissionId}/${candidateId}/${Date.now()}-${sanitized}`;

    const { error } = await supabase.storage.from('admissions').upload(path, file);
    if (error) {
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
    } else {
      await supabase.from('admission_files').insert({
        admission_request_id: admissionId,
        candidate_id: candidateId,
        file_type: 'EXAME_ADICIONAL',
        storage_path: path,
        original_filename: sanitized,
        uploaded_by: 'ADMIN',
        link_type: 'EXAM',
      } as any);
      toast({ title: 'Exame anexado com sucesso!' });
      loadFiles();
      qc.invalidateQueries({ queryKey: ['admission_files', admissionId] });
    }
    setUploading(false);
  };

  const handleDownload = async (storagePath: string) => {
    const { data } = await supabase.storage.from('admissions').createSignedUrl(storagePath, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  return (
    <div className="space-y-2 pt-2 border-t border-border mt-2">
      <Label className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
        <Upload className="w-3 h-3" /> Exame Adicional (Anexo)
      </Label>

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map(f => (
            <div key={f.id} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
              <span className="flex items-center gap-1 truncate">
                <FileText className="w-3 h-3 text-muted-foreground" />
                {f.original_filename || 'exame'}
              </span>
              <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => handleDownload(f.storage_path)}>
                <Download className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          disabled={uploading}
          onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
          className="text-xs h-8"
        />
        {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
      </div>
      <p className="text-[10px] text-muted-foreground">Aceitos: PDF, JPG, PNG (máx. 10MB)</p>
    </div>
  );
}
