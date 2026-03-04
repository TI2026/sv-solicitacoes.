import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, CheckCircle, ShieldX, FileText, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/logo.png';

interface LinkData {
  candidate_id: string;
  candidate_name: string;
  admission_request_id: string;
  link_type: string;
  expires_at: string;
  candidate_uploaded_at: string | null;
  uploaded_files: Array<{ name: string; file_type: string }>;
}

const DOCUMENT_CHECKLIST = [
  { category: 'Documentos Pessoais', items: [
    'RG ou CNH válida', 'CPF', 'CTPS Digital (CPF vinculado)', 'Comprovante de residência atualizado',
    'Certidão de nascimento ou casamento', 'Título de eleitor', 'Quitação eleitoral',
    'Certificado de reservista (quando aplicável)', 'Número do PIS/PASEP',
  ]},
  { category: 'Dependentes (se aplicável)', items: [
    'Certidão de nascimento dos filhos', 'CPF dos dependentes',
    'Carteira de vacinação (até 6 anos)', 'Comprovante de matrícula escolar (7 a 14 anos)',
    'Laudo médico (dependente com deficiência)',
  ]},
];

export default function PublicDocumentsPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LinkData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [bankInfo, setBankInfo] = useState({ banco: '', agencia: '', conta: '', tipo: 'corrente' });

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
        if (result.link_type !== 'DOCUMENTS') {
          setError('Token inválido para esta página');
        } else if (result.candidate_uploaded_at) {
          setSubmitted(true);
          setData(result);
        } else {
          setData(result);
          setUploadedFiles(result.uploaded_files?.map((f: any) => f.name) || []);
          setError(null);
        }
      }
    } catch {
      setError('Erro ao validar token');
    }
    setLoading(false);
  };

  const handleUpload = async (file: File, fileType: string = 'generic') => {
    if (!token) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 10MB', variant: 'destructive' });
      return;
    }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      toast({ title: 'Tipo não permitido', description: 'Use PDF, JPG ou PNG', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/public-documents-submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, filename: file.name, content_type: file.type, file_type: fileType }),
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
      toast({ title: 'Documento enviado!' });
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
      toast({ title: 'Documentos finalizados com sucesso!' });
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
            <h2 className="text-lg font-bold text-foreground mb-2">Documentos Enviados!</h2>
            <p className="text-sm text-muted-foreground">Obrigado, {data.candidate_name}. Seus documentos foram recebidos com sucesso. Aguarde o contato do RH.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col items-center">
          <img src={logo} alt="Logo" className="w-16 h-16 rounded-full object-contain bg-white shadow border-2 border-primary/20 p-0.5 mb-3" />
          <h1 className="text-xl font-bold text-foreground">Envio de Documentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Olá, {data.candidate_name}!</p>
          <p className="text-xs text-muted-foreground">Válido até {new Date(data.expires_at).toLocaleDateString('pt-BR')}</p>
        </div>

        {/* Checklist */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documentos Necessários</CardTitle>
            <CardDescription>Envie os documentos listados abaixo em PDF, JPG ou PNG (máx. 10MB)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {DOCUMENT_CHECKLIST.map(cat => (
              <div key={cat.category}>
                <p className="text-xs font-semibold text-foreground mb-1">{cat.category}</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                  {cat.items.map(item => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="w-4 h-4" /> Upload de Documentos
            </CardTitle>
            <CardDescription>Selecione e envie seus documentos um por vez</CardDescription>
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
              <Label className="text-xs">Selecionar arquivo</Label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                disabled={uploading}
                onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
              />
              {uploading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            </div>
          </CardContent>
        </Card>

        {/* Banking Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados Bancários</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Banco</Label><Input value={bankInfo.banco} onChange={e => setBankInfo(p => ({ ...p, banco: e.target.value }))} placeholder="Ex: Banco do Brasil" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Agência</Label><Input value={bankInfo.agencia} onChange={e => setBankInfo(p => ({ ...p, agencia: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Número da conta</Label><Input value={bankInfo.conta} onChange={e => setBankInfo(p => ({ ...p, conta: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de conta</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={bankInfo.tipo}
                onChange={e => setBankInfo(p => ({ ...p, tipo: e.target.value }))}
              >
                <option value="corrente">Corrente</option>
                <option value="poupanca">Poupança</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Finalize */}
        <Button onClick={handleFinalize} disabled={uploadedFiles.length === 0} className="w-full gap-2">
          <CheckCircle className="w-4 h-4" /> Finalizar Envio
        </Button>
        {uploadedFiles.length === 0 && (
          <p className="text-xs text-center text-muted-foreground">
            Envie ao menos 1 documento para finalizar.
          </p>
        )}
      </div>
    </div>
  );
}
