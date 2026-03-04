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

const ADMIN_DOC_KEYS = [
  { key: 'CONTRATO_TRABALHO_ADMIN', label: 'Contrato de trabalho', optional: false },
  { key: 'FICHA_REGISTRO_ADMIN', label: 'Ficha de registro do empregado', optional: false },
  { key: 'DECLARACAO_DEPENDENTES_IRRF_ADMIN', label: 'Declaração de dependentes para IRRF', optional: false },
  { key: 'AUTORIZACAO_DESCONTO_VT_ADMIN', label: 'Autorização de desconto (VT, etc.)', optional: false },
  { key: 'TERMO_RESPONSABILIDADE_EQUIP_ADMIN', label: 'Termo de responsabilidade de equipamentos', optional: true },
  { key: 'TERMO_CONFIDENCIALIDADE_ADMIN', label: 'Termo de confidencialidade', optional: true },
];

export default function PublicSignaturePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SignatureData | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // Track uploaded signed files per doc_key
  const [uploadedKeys, setUploadedKeys] = useState<Record<string, string>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

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

  const findFileForKey = (docKey: string) => {
    if (!data?.files_to_sign) return null;
    return data.files_to_sign.find(f => f.name?.includes(docKey) || f.url?.includes(docKey)) || null;
  };

  const handleUploadSigned = async (file: File, docKey: string) => {
    if (!token) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 10MB', variant: 'destructive' });
      return;
    }
    setUploadingKey(docKey);
    try {
      const signedDocKey = docKey.replace('_ADMIN', '_SIGNED');
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/public-signature-submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            filename: `${signedDocKey}-${file.name}`,
            content_type: file.type,
            mode: 'candidate',
            doc_key: signedDocKey,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Erro ao gerar URL');
      }
      const { signedUrl } = await res.json();
      const uploadRes = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!uploadRes.ok) throw new Error('Falha no upload');
      setUploadedKeys(prev => ({ ...prev, [docKey]: file.name }));
      toast({ title: `${ADMIN_DOC_KEYS.find(d => d.key === docKey)?.label || 'Documento'} assinado enviado!` });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setUploadingKey(null);
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

  // Count required docs that have either an admin file available OR are optional without admin file
  const availableDocs = ADMIN_DOC_KEYS.filter(d => {
    const adminFile = findFileForKey(d.key);
    return adminFile != null; // Only docs the admin actually uploaded
  });

  const requiredUploaded = availableDocs.filter(d => !d.optional).every(d => !!uploadedKeys[d.key]);
  const optionalWithFileUploaded = availableDocs.filter(d => d.optional).every(d => !!uploadedKeys[d.key]);
  const allUploaded = requiredUploaded && optionalWithFileUploaded;

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

        {/* Documents: Download + Upload per item */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Documentos para Assinatura
            </CardTitle>
            <CardDescription>Para cada documento: baixe, assine via CDGov, e reenvie o assinado ao lado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ADMIN_DOC_KEYS.map(doc => {
              const adminFile = findFileForKey(doc.key);
              const signedFile = uploadedKeys[doc.key];
              const isUploading = uploadingKey === doc.key;

              if (!adminFile) {
                // Admin hasn't uploaded this doc — show as N/A
                return (
                  <div key={doc.key} className="flex items-center gap-2 border border-border rounded-lg p-3 opacity-50">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-foreground flex-1">{doc.label}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {doc.optional ? 'Não aplicável' : 'Aguardando RH'}
                    </span>
                  </div>
                );
              }

              return (
                <div key={doc.key} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm font-medium text-foreground flex-1">{doc.label}</span>
                    {signedFile && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium status-approved">
                        <CheckCircle className="w-3 h-3" /> Enviado
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Download button */}
                    <a href={adminFile.url} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-1 text-xs">
                        <Download className="w-3 h-3" /> Baixar
                      </Button>
                    </a>

                    {/* Upload signed button */}
                    <Label htmlFor={`upload-${doc.key}`} className="cursor-pointer">
                      <Button variant={signedFile ? 'ghost' : 'default'} size="sm" className="gap-1 text-xs pointer-events-none" disabled={isUploading}>
                        {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        {signedFile ? 'Substituir' : 'Anexar assinado'}
                      </Button>
                    </Label>
                    <Input
                      id={`upload-${doc.key}`}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      disabled={isUploading}
                      onChange={e => { if (e.target.files?.[0]) handleUploadSigned(e.target.files[0], doc.key); }}
                    />
                  </div>

                  {signedFile && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-primary" /> {signedFile}
                    </p>
                  )}
                </div>
              );
            })}

            {/* Show any extra files not matching known keys */}
            {data.files_to_sign?.filter(f =>
              !ADMIN_DOC_KEYS.some(k => f.name?.includes(k.key) || f.url?.includes(k.key))
            ).map((file, idx) => (
              <a key={idx} href={file.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                <FileText className="w-4 h-4 text-primary" />
                <span className="text-sm text-foreground flex-1">{file.name}</span>
                <Download className="w-4 h-4 text-muted-foreground" />
              </a>
            ))}
          </CardContent>
        </Card>

        {/* Finalize */}
        <Button onClick={handleFinalize} disabled={!allUploaded || availableDocs.length === 0} className="w-full gap-2">
          <CheckCircle className="w-4 h-4" /> Finalizar Envio dos Documentos Assinados
        </Button>
        {!allUploaded && availableDocs.length > 0 && (
          <p className="text-xs text-center text-muted-foreground">
            Envie todos os documentos assinados para finalizar.
          </p>
        )}
        {availableDocs.length === 0 && (
          <p className="text-xs text-center text-muted-foreground">
            Nenhum documento disponível ainda. Aguarde o RH enviar os documentos.
          </p>
        )}
      </div>
    </div>
  );
}
