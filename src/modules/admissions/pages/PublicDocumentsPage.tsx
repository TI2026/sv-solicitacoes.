import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, CheckCircle, ShieldX, FileText, AlertTriangle } from 'lucide-react';
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
  const [data, setData] = useState<TokenData | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Banking info
  const [bankInfo, setBankInfo] = useState({ banco: '', agencia: '', conta: '', tipo: 'corrente' });

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'zeaerqlvhrbcuubueolh';

  useEffect(() => {
    if (!token) { setError('Token não fornecido'); setLoading(false); return; }
    validateToken();
  }, [token]);

  const validateToken = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admissions-validate-token?token=${token}&purpose=documents`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Token inválido ou expirado');
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
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 10MB', variant: 'destructive' });
      return;
    }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      toast({ title: 'Tipo não permitido', description: 'Use PDF, JPG ou PNG', variant: 'destructive' });
      return;
    }

    setUploading(candidateDocId);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admissions-create-signed-upload`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, document_id: documentId, candidate_document_id: candidateDocId, filename: file.name, content_type: file.type }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Erro ao gerar URL');
      }
      const { signedUrl } = await res.json();
      const uploadRes = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!uploadRes.ok) throw new Error('Falha no upload');
      toast({ title: 'Documento enviado!' });
      await validateToken();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(null);
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

  const allRequiredDone = data.documents.filter(d => d.required).every(d => d.status !== 'pending');

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

        {/* Checklist informativo */}
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

        {/* Upload documents */}
        {data.documents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload de Documentos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.documents.map(doc => (
                <div key={doc.id} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{doc.label}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          doc.status === 'pending' ? 'status-pending' :
                          doc.status === 'submitted' ? 'status-info' :
                          doc.status === 'approved' ? 'status-approved' : 'status-rejected'
                        }`}>
                          {doc.status === 'pending' ? 'Pendente' : doc.status === 'submitted' ? 'Enviado' : doc.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                        </span>
                        {doc.required && <span className="text-[10px] text-destructive">Obrigatório</span>}
                      </div>
                    </div>
                  </div>

                  {(doc.status === 'pending' || doc.status === 'rejected') && (
                    <div className="space-y-1.5">
                      {doc.status === 'rejected' && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Documento rejeitado. Reenvie.
                        </p>
                      )}
                      <Input
                        type="file"
                        accept="image/*,application/pdf"
                        disabled={uploading === doc.id}
                        onChange={e => { if (e.target.files?.[0]) handleUpload(doc.id, doc.document_id, e.target.files[0]); }}
                      />
                      {uploading === doc.id && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                    </div>
                  )}
                  {doc.status === 'submitted' && (
                    <p className="text-xs text-muted-foreground">Aguardando revisão do RH</p>
                  )}
                  {doc.status === 'approved' && (
                    <p className="text-xs text-primary">✅ Aprovado</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

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
        <Button onClick={handleFinalize} disabled={!allRequiredDone} className="w-full gap-2">
          <CheckCircle className="w-4 h-4" /> Finalizar Envio
        </Button>
        {!allRequiredDone && (
          <p className="text-xs text-center text-muted-foreground">
            Envie todos os documentos obrigatórios para finalizar.
          </p>
        )}
      </div>
    </div>
  );
}
