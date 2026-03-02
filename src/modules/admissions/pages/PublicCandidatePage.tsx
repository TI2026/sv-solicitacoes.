import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/StatusBadge';
import { DOC_STATUS_LABELS } from '@/lib/constants';
import { Loader2, Upload, CheckCircle, AlertTriangle, ShieldX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/logo.png';

interface TokenData {
  candidate_id: string;
  candidate_name: string;
  documents: Array<{
    id: string;
    document_id: string;
    label: string;
    required: boolean;
    status: string;
    file_path: string | null;
  }>;
  expires_at: string;
}

export default function PublicCandidatePage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TokenData | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'zeaerqlvhrbcuubueolh';

  useEffect(() => {
    if (!token) return;
    validateToken();
  }, [token]);

  const validateToken = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admissions-validate-token?token=${token}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Token inválido ou expirado');
        setData(null);
      } else {
        const result = await res.json();
        setData(result);
        setError(null);
      }
    } catch {
      setError('Erro ao validar token');
    }
    setLoading(false);
  };

  const handleUpload = async (candidateDocId: string, documentId: string, file: File) => {
    if (!data || !token) return;
    setUploading(candidateDocId);
    try {
      // Get signed upload URL from edge function
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admissions-create-signed-upload`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            document_id: documentId,
            candidate_document_id: candidateDocId,
            filename: file.name,
            content_type: file.type,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Erro ao gerar URL de upload');
      }
      const { signedUrl, path } = await res.json();

      // Upload to signed URL
      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error('Falha no upload');

      toast({ title: 'Documento enviado!' });
      // Refresh data
      await validateToken();
    } catch (err: any) {
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <ShieldX className="w-12 h-12 mx-auto text-destructive mb-4" />
            <h2 className="text-lg font-bold text-foreground mb-2">Acesso Negado</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const requiredDocs = data.documents.filter(d => d.required);
  const allRequiredSubmitted = requiredDocs.every(d => d.status !== 'pending');

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col items-center">
          <img src={logo} alt="SV Engenharia" className="w-16 h-16 rounded-full object-contain bg-white shadow border-2 border-primary/20 p-0.5 mb-3" />
          <h1 className="text-xl font-bold text-foreground">Envio de Documentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Olá, {data.candidate_name}!</p>
          <p className="text-xs text-muted-foreground">Válido até {new Date(data.expires_at).toLocaleDateString('pt-BR')}</p>
        </div>

        {allRequiredSubmitted && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-4 text-center">
              <CheckCircle className="w-8 h-8 mx-auto text-primary mb-2" />
              <p className="text-sm font-medium text-foreground">Todos os documentos obrigatórios foram enviados!</p>
              <p className="text-xs text-muted-foreground mt-1">Aguarde a análise do RH.</p>
            </CardContent>
          </Card>
        )}

        {/* Documents list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documentos Necessários</CardTitle>
            <CardDescription>Envie os documentos abaixo em formato PDF, JPG ou PNG</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.documents.map(doc => (
              <div key={doc.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{doc.label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StatusBadge status={doc.status} label={DOC_STATUS_LABELS[doc.status] || doc.status} />
                      {doc.required && <span className="text-[10px] text-destructive">Obrigatório</span>}
                    </div>
                  </div>
                </div>

                {doc.status === 'pending' || doc.status === 'rejected' ? (
                  <div className="space-y-1.5">
                    {doc.status === 'rejected' && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Documento rejeitado. Reenvie.
                      </p>
                    )}
                    <Label className="text-xs">Selecionar arquivo</Label>
                    <Input
                      type="file"
                      accept="image/*,application/pdf"
                      disabled={uploading === doc.id}
                      onChange={e => {
                        if (e.target.files?.[0]) handleUpload(doc.id, doc.document_id, e.target.files[0]);
                      }}
                    />
                    {uploading === doc.id && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {doc.status === 'submitted' ? 'Aguardando revisão' : doc.status === 'approved' ? '✅ Aprovado' : doc.status}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
