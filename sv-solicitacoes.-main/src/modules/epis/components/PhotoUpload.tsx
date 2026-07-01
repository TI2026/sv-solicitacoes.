import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, ImagePlus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { validateFileMagicNumber } from '@/lib/fileValidation';

interface PhotoUploadProps {
  label?: string;
  folder?: string;
  maxFiles?: number;
  onPhotosChange: (urls: string[]) => void;
}

export function PhotoUpload({ label = 'Fotos', folder = 'photos', maxFiles = 5, onPhotosChange }: PhotoUploadProps) {
  const [photos, setPhotos] = useState<{ localUrl: string; storagePath: string | null; uploading: boolean }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const remaining = maxFiles - photos.length;
    let toProcess = Array.from(files).slice(0, remaining);
    if (toProcess.length === 0) return;

    // Validate mime types & magic numbers
    const allowed = ['image/jpeg', 'image/png', 'image/webp'] as const;
    const validFiles: File[] = [];
    for (const f of toProcess) {
      if (!allowed.includes(f.type as any)) {
        toast({ title: 'Tipo não permitido', description: `${f.name} não é uma imagem válida.`, variant: 'destructive' });
        continue;
      }
      const isValid = await validateFileMagicNumber(f, allowed as any);
      if (!isValid) {
        toast({ title: 'Arquivo corrompido', description: `${f.name} parece ser forjado ou está corrompido.`, variant: 'destructive' });
        continue;
      }
      validFiles.push(f);
    }
    
    toProcess = validFiles;
    if (toProcess.length === 0) return;

    const newPhotos = toProcess.map(f => ({
      localUrl: URL.createObjectURL(f),
      storagePath: null as string | null,
      uploading: true,
      file: f,
    }));

    const startIdx = photos.length;
    setPhotos(prev => [...prev, ...newPhotos.map(({ file, ...rest }) => rest)]);

    for (let i = 0; i < newPhotos.length; i++) {
      const f = toProcess[i];
      const ext = f.name.split('.').pop() || 'jpg';
      const path = `${folder}/${Date.now()}_${i}.${ext}`;

      const { error } = await supabase.storage.from('epis').upload(path, f, {
        contentType: f.type,
        upsert: false,
      });

      setPhotos(prev => {
        const updated = [...prev];
        const idx = startIdx + i;
        if (updated[idx]) {
          updated[idx] = {
            ...updated[idx],
            storagePath: error ? null : path,
            uploading: false,
          };
        }
        const urls = updated.filter(p => p.storagePath).map(p => p.storagePath!);
        onPhotosChange(urls);
        return updated;
      });
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      const updated = prev.filter((_, i) => i !== index);
      const urls = updated.filter(p => p.storagePath).map(p => p.storagePath!);
      onPhotosChange(urls);
      return updated;
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-muted">
              <img src={p.localUrl} alt="" className="w-full h-full object-cover" />
              {p.uploading && (
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
              )}
              {!p.uploading && (
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {photos.length < maxFiles && (
        <div className="flex gap-2">
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
          />
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => cameraInputRef.current?.click()}>
            <Camera className="w-4 h-4" /> Câmera
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="w-4 h-4" /> Galeria
          </Button>
          <span className="text-xs text-muted-foreground self-center">{photos.length}/{maxFiles}</span>
        </div>
      )}
    </div>
  );
}
