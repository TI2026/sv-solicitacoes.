import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Upload, CheckCircle, ShieldX, FileText, AlertTriangle, X } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
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

interface DocItem {
  key: string;
  label: string;
  required: boolean;
  category: string;
}

const PERSONAL_DOCS: DocItem[] = [
  { key: 'RG_CNH', label: 'RG ou CNH válida', required: true, category: 'pessoal' },
  { key: 'CPF', label: 'CPF', required: true, category: 'pessoal' },
  { key: 'CTPS', label: 'CTPS Digital (CPF vinculado)', required: true, category: 'pessoal' },
  { key: 'RESIDENCIA', label: 'Comprovante de residência atualizado', required: true, category: 'pessoal' },
  { key: 'CERTIDAO', label: 'Certidão de nascimento ou casamento', required: true, category: 'pessoal' },
  { key: 'TITULO_ELEITOR', label: 'Título de eleitor', required: true, category: 'pessoal' },
  { key: 'QUITACAO_ELEITORAL', label: 'Quitação eleitoral', required: true, category: 'pessoal' },
  { key: 'RESERVISTA', label: 'Certificado de reservista (quando aplicável)', required: false, category: 'pessoal' },
  { key: 'PIS_PASEP', label: 'Número do PIS/PASEP', required: true, category: 'pessoal' },
];

const DEPENDENT_DOCS: DocItem[] = [
  { key: 'DEP_CERTIDAO', label: 'Certidão de nascimento dos filhos', required: true, category: 'dependente' },
  { key: 'DEP_CPF', label: 'CPF dos dependentes', required: true, category: 'dependente' },
  { key: 'DEP_VACINA', label: 'Carteira de vacinação (até 6 anos)', required: false, category: 'dependente' },
  { key: 'DEP_MATRICULA', label: 'Comprovante de matrícula escolar (7 a 14 anos)', required: false, category: 'dependente' },
  { key: 'DEP_LAUDO', label: 'Laudo médico (dependente com deficiência)', required: false, category: 'dependente' },
];

export default function PublicDocumentsPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LinkData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Per-item upload state: doc_key -> { file: File | null, uploading, uploaded, filename }
  const [docStates, setDocStates] = useState<Record<string, {
    file: File | null;
    uploading: boolean;
    uploaded: boolean;
    filename: string;
  }>>({});

  const [hasDependents, setHasDependents] = useState(false);
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
          // Populate already-uploaded docs
          const initialStates: Record<string, any> = {};
          for (const f of (result.uploaded_files || [])) {
            if (f.file_type && f.file_type !== 'generic') {
              initialStates[f.file_type] = { file: null, uploading: false, uploaded: true, filename: f.name };
            }
          }
          setDocStates(initialStates);
          setError(null);
        }
      }
    } catch {
      setError('Erro ao validar token');
    }
    setLoading(false);
  };

  const uploadFile = useCallback(async (docKey: string, file: File) => {
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

    setDocStates(prev => ({ ...prev, [docKey]: { file, uploading: true, uploaded: false, filename: file.name } }));

    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/public-documents-submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, filename: file.name, content_type: file.type, file_type: docKey }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Erro ao gerar URL');
      }
      const { signedUrl } = await res.json();
      const uploadRes = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!uploadRes.ok) throw new Error('Falha no upload');

      setDocStates(prev => ({ ...prev, [docKey]: { file: null, uploading: false, uploaded: true, filename: file.name } }));
      toast({ title: 'Documento enviado!' });
    } catch (err: any) {
      setDocStates(prev => ({ ...prev, [docKey]: { file: null, uploading: false, uploaded: false, filename: '' } }));
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  }, [token, projectId, toast]);

  const removeDoc = (docKey: string) => {
    setDocStates(prev => {
      const copy = { ...prev };
      delete copy[docKey];
      return copy;
    });
  };

  const requiredPersonalKeys = PERSONAL_DOCS.filter(d => d.required).map(d => d.key);
  const requiredDependentKeys = hasDependents ? DEPENDENT_DOCS.filter(d => d.required).map(d => d.key) : [];
  const allRequiredKeys = [...requiredPersonalKeys, ...requiredDependentKeys];

  const allRequiredUploaded = allRequiredKeys.every(k => docStates[k]?.uploaded);
  const bankComplete = bankInfo.banco.trim() && bankInfo.agencia.trim() && bankInfo.conta.trim();
  const canFinalize = allRequiredUploaded && bankComplete;

  const handleFinalize = async () => {
    if (!token || !canFinalize) return;
    setSubmitting(true);
    try {
      // Send bank info along with finalization
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/admissions-finalize-signed-docs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, bank_info: bankInfo }),
        }
      );
      setSubmitted(true);
      toast({ title: 'Documentos finalizados com sucesso!' });
    } catch {
      toast({ title: 'Erro ao finalizar', variant: 'destructive' });
    }
    setSubmitting(false);
  };

  const renderDocItem = (doc: DocItem) => {
    const state = docStates[doc.key];
    const isUploaded = state?.uploaded;
    const isUploading = state?.uploading;

    return (
      <div key={doc.key} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">
            {doc.label}
            {doc.required && <span className="text-destructive ml-1">*</span>}
          </p>
          {isUploaded && state?.filename && (
            <p className="text-xs text-primary flex items-center gap-1 mt-0.5">
              <CheckCircle className="w-3 h-3" /> {state.filename}
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : isUploaded ? (
            <div className="flex items-center gap-1">
              <CheckCircle className="w-4 h-4 text-primary" />
              {!submitted && (
                <Button variant="ghost" size="sm" className="h-6 px-1" onClick={() => removeDoc(doc.key)}>
                  <X className="w-3 h-3 text-muted-foreground" />
                </Button>
              )}
            </div>
          ) : (
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={e => {
                  if (e.target.files?.[0]) uploadFile(doc.key, e.target.files[0]);
                  e.target.value = '';
                }}
              />
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-input bg-background hover:bg-accent text-foreground transition-colors">
                <Upload className="w-3 h-3" /> Enviar
              </span>
            </label>
          )}
        </div>
      </div>
    );
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
      <div className="max-w-lg mx-auto space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col items-center">
          <img src={logo} alt="Logo" className="w-16 h-16 rounded-full object-contain bg-white shadow border-2 border-primary/20 p-0.5 mb-3" />
          <h1 className="text-xl font-bold text-foreground">Envio de Documentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Olá, {data.candidate_name}!</p>
          <p className="text-xs text-muted-foreground">Válido até {new Date(data.expires_at).toLocaleDateString('pt-BR')}</p>
        </div>

        {/* Personal documents */}
        <Accordion type="multiple" defaultValue={['pessoais', 'bancarios']}>
          <AccordionItem value="pessoais">
            <AccordionTrigger className="text-sm font-semibold">
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4" /> Documentos Pessoais
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({requiredPersonalKeys.filter(k => docStates[k]?.uploaded).length}/{requiredPersonalKeys.length})
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {PERSONAL_DOCS.map(renderDocItem)}
            </AccordionContent>
          </AccordionItem>

          {/* Dependents toggle */}
          <AccordionItem value="dependentes">
            <AccordionTrigger className="text-sm font-semibold">
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4" /> Dependentes
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex items-center gap-3 mb-3 py-2">
                <Switch checked={hasDependents} onCheckedChange={setHasDependents} id="has-deps" />
                <Label htmlFor="has-deps" className="text-sm">Possui dependentes?</Label>
              </div>
              {hasDependents && DEPENDENT_DOCS.map(renderDocItem)}
              {!hasDependents && (
                <p className="text-xs text-muted-foreground py-2">Ative o toggle acima se possui dependentes.</p>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Banking */}
          <AccordionItem value="bancarios">
            <AccordionTrigger className="text-sm font-semibold">
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4" /> Dados Bancários
                {bankComplete && <CheckCircle className="w-3 h-3 text-primary" />}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Banco *</Label>
                  <Input value={bankInfo.banco} onChange={e => setBankInfo(p => ({ ...p, banco: e.target.value }))} placeholder="Ex: Banco do Brasil" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Agência *</Label>
                    <Input value={bankInfo.agencia} onChange={e => setBankInfo(p => ({ ...p, agencia: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Número da conta *</Label>
                    <Input value={bankInfo.conta} onChange={e => setBankInfo(p => ({ ...p, conta: e.target.value }))} />
                  </div>
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
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Finalize */}
        <div className="space-y-2">
          {!canFinalize && (
            <div className="text-xs text-muted-foreground text-center space-y-1">
              {!allRequiredUploaded && (
                <p className="flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Envie todos os documentos obrigatórios (marcados com *)
                </p>
              )}
              {!bankComplete && (
                <p className="flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Preencha os dados bancários
                </p>
              )}
            </div>
          )}
          <Button onClick={handleFinalize} disabled={!canFinalize || submitting} className="w-full gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Finalizar Envio
          </Button>
        </div>
      </div>
    </div>
  );
}
