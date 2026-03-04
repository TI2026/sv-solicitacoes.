import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, ShieldX, FileText, Download, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/logo.png';

interface SignatureData {
  candidate_id: string;
  candidate_name: string;
  admission_request_id: string;
  link_type: string;
  files_to_sign: Array<{ name: string; url: string; size: number }>;
  expires_at: string;
  admin_uploaded_at: string | null;
  candidate_uploaded_at: string | null;
}

const INTERNAL_DOCS_MAP: Record<string, string> = {
  CONTRATO_TRABALHO_ADMIN: 'Contrato de trabalho',
  FICHA_REGISTRO_ADMIN: 'Ficha de registro do empregado',
  DECLARACAO_DEPENDENTES_IRRF_ADMIN: 'Declaração de dependentes para IRRF',
  AUTORIZACAO_DESCONTO_VT_ADMIN: 'Autorização de desconto (VT, etc.)',
  TERMO_RESPONSABILIDADE_EQUIP_ADMIN: 'Termo de responsabilidade de equipamentos',
  TERMO_CONFIDENCIALIDADE_ADMIN: 'Termo de confidencialidade',
};

const INTERNAL_DOC_KEYS = Object.keys(INTERNAL_DOCS_MAP);

export default function PublicSignaturePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SignatureData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'zeaerqlvhrbcuubueolh';

  useEffect(() => {
    if (!token) { setError('Token não fornecido'); setLoading(false); return; }
    lookupToken();
  }, [token]);

  const lookupToken = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/public-link-lookup?token=${token}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Token inválido ou expirado');
      } else {
        const result = await res.json();
        if (result.link_type !== 'SIGNATURE') {
          setError('Token inválido para esta página');
        } else if (result.candidate_uploaded_at) {
          setSubmitted(true);
          setData(result);
        } else {
          setData(result);
          setError(null);
        }
      }
    } catch {
      setError('Erro ao validar token');
    }
    setLoading(false);
  };

  const handleUpload = async (file: File) => {
    if (!token) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 10MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/public-signature-submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, filename: file.name, content_type: file.type, mode: 'candidate' }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Erro ao gerar URL');
      }
      const { signedUrl } = await res.json();
      const uploadRes = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!uploadRes.ok) throw new Error('Falha no upload');
      setUploadedFiles(prev => [...prev, file.name]);
      toast({ title: 'Documento assinado enviado!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleFinalize = async () => {
    if (!token) return;
    setSubmitted(true);
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/admissions-finalize-signed-docs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        }
      );
      toast({ title: 'Documentos assinados enviados com sucesso!' });
    } catch {
      toast({ title: 'Erro ao finalizar', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <ShieldX className="w-12 h-12 mx-auto text-destructive mb-4" />
            <h2 className="text-lg font-bold text-foreground mb-2">Acesso Negado</h2>
            <p className="text-sm text-muted-foreground">{error || 'Token inválido'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-12 h-12 mx-auto text-primary mb-4" />
            <h2 className="text-lg font-bold text-foreground mb-2">Documentos Assinados Recebidos!</h2>
            <p className="text-sm text-muted-foreground">Obrigado, {data.candidate_name}. Seus documentos assinados foram recebidos. Aguarde a confirmação do RH.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasDocsToSign = data.files_to_sign && data.files_to_sign.length > 0;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col items-center">
          <img src={logo} alt="Logo" className="w-16 h-16 rounded-full object-contain bg-white shadow border-2 border-primary/20 p-0.5 mb-3" />
          <h1 className="text-xl font-bold text-foreground">Assinatura de Documentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Olá, {data.candidate_name}!</p>
          <p className="text-xs text-muted-foreground">Válido até {new Date(data.expires_at).toLocaleDateString('pt-BR')}</p>
        </div>

        {/* Step 1: Download docs for signing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="w-4 h-4" /> 1. Baixe os documentos
            </CardTitle>
            <CardDescription>Baixe os documentos abaixo, assine via CDGov e reenvie na seção seguinte.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {INTERNAL_DOC_KEYS.map(docKey => {
              const file = data.files_to_sign?.find(f => f.name === docKey || f.name?.includes(docKey));
              // Also try matching by URL containing the doc key
              const fileByUrl = !file ? data.files_to_sign?.find(f => f.url?.includes(docKey)) : file;
              const matched = file || fileByUrl;

              return (
                <div key={docKey} className="flex items-center gap-2 border border-border rounded-lg p-3">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-sm text-foreground flex-1">{INTERNAL_DOCS_MAP[docKey]}</span>
                  {matched ? (
                    <a href={matched.url} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-1 text-xs">
                        <Download className="w-3 h-3" /> Baixar
                      </Button>
                    </a>
                  ) : (
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">Aguardando</span>
                  )}
                </div>
              );
            })}

            {/* Show any extra files not matching known keys */}
            {data.files_to_sign?.filter(f => !INTERNAL_DOC_KEYS.some(k => f.name === k || f.name?.includes(k) || f.url?.includes(k))).map((file, idx) => (
              <a
                key={idx}
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors"
              >
                <FileText className="w-4 h-4 text-primary" />
                <span className="text-sm text-foreground flex-1">{file.name}</span>
                <Download className="w-4 h-4 text-muted-foreground" />
              </a>
            ))}
          </CardContent>
        </Card>

        {/* Step 2: Upload signed docs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="w-4 h-4" /> 2. Reenvie os documentos assinados
            </CardTitle>
            <CardDescription>Após assinar via CDGov, faça upload dos PDFs assinados aqui.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {uploadedFiles.length > 0 && (
              <div className="space-y-1">
                {uploadedFiles.map((f, idx) => (
                  <p key={idx} className="text-xs text-primary flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> {f}
                  </p>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Selecionar arquivo (PDF, JPG, PNG — máx. 10MB)</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                disabled={uploading}
                onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
              />
              {uploading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            </div>
          </CardContent>
        </Card>

        {/* Finalize */}
        <Button onClick={handleFinalize} disabled={uploadedFiles.length === 0} className="w-full gap-2">
          <CheckCircle className="w-4 h-4" /> Finalizar Envio dos Documentos Assinados
        </Button>
        {uploadedFiles.length === 0 && (
          <p className="text-xs text-center text-muted-foreground">
            Envie ao menos 1 documento assinado para finalizar.
          </p>
        )}
      </div>
    </div>
  );
}
