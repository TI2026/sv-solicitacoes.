import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, CheckCircle, ShieldX, FileText, AlertTriangle, X, CreditCard, Clock } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { maskAgency, maskAccount } from '@/lib/masks';
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

const BANK_LIST = [
  'Itaú Unibanco', 'Banco do Brasil', 'Bradesco', 'Caixa Econômica Federal',
  'Santander Brasil', 'Nubank', 'Banco Inter', 'C6 Bank', 'PicPay', 'PagBank',
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

  const [docStates, setDocStates] = useState<Record<string, {
    file: File | null;
    uploading: boolean;
    uploaded: boolean;
    filename: string;
  }>>({});

  const [hasDependents, setHasDependents] = useState(false);
  const [bankSelection, setBankSelection] = useState('');
  const [bankCustom, setBankCustom] = useState('');
  const [bankInfo, setBankInfo] = useState({ agencia: '', conta: '', tipo: 'corrente' });

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'zeaerqlvhrbcuubueolh';

  // Derive the final bank name
  const bankName = bankSelection === '__outro__' ? bankCustom.trim() : bankSelection;
  const bankComplete = bankName.length > 0 && bankInfo.agencia.replace(/\D/g, '').length >= 3 && bankInfo.conta.replace(/\D/g, '').length >= 3 && bankInfo.tipo;

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

  const personalUploaded = PERSONAL_DOCS.filter(d => docStates[d.key]?.uploaded).length;
  const depUploaded = hasDependents ? DEPENDENT_DOCS.filter(d => docStates[d.key]?.uploaded).length : 0;
  const totalDocs = PERSONAL_DOCS.length + (hasDependents ? DEPENDENT_DOCS.length : 0);
  const totalUploaded = personalUploaded + depUploaded;
  const overallProgress = totalDocs > 0 ? Math.round((totalUploaded / totalDocs) * 100) : 0;

  const canFinalize = allRequiredUploaded && bankComplete;

  const handleFinalize = async () => {
    if (!token || !canFinalize) return;
    setSubmitting(true);
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/admissions-finalize-signed-docs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, bank_info: { banco: bankName, agencia: bankInfo.agencia.replace(/\D/g, ''), conta: bankInfo.conta.replace(/\D/g, ''), tipo: bankInfo.tipo } }),
        }
      );
      setSubmitted(true);
      toast({ title: 'Documentos finalizados com sucesso!' });
    } catch {
      toast({ title: 'Erro ao finalizar', variant: 'destructive' });
    }
    setSubmitting(false);
  };

  // Auto-detect bank from existing data on load
  useEffect(() => {
    if (data && bankSelection === '' && bankName === '') {
      // If previously saved bank info exists in uploaded_files metadata, it would be here
      // For now, just leave empty for new submissions
    }
  }, [data]);

  const renderDocItem = (doc: DocItem) => {
    const state = docStates[doc.key];
    const isUploaded = state?.uploaded;
    const isUploading = state?.uploading;

    return (
      <div key={doc.key} className="flex items-center gap-3 py-3 px-3 border border-border rounded-lg mb-2 bg-card">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-medium text-foreground">{doc.label}</p>
          </div>
          <div className="flex items-center gap-2">
            {doc.required ? (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Obrigatório</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">Opcional</Badge>
            )}
            {isUploaded ? (
              <Badge className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0 gap-1">
                <CheckCircle className="w-3 h-3" /> Enviado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                <Clock className="w-3 h-3" /> Pendente
              </Badge>
            )}
          </div>
          {isUploaded && state?.filename && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{state.filename}</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : isUploaded ? (
            <div className="flex items-center gap-1">
              <CheckCircle className="w-5 h-5 text-primary" />
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
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-primary bg-primary/5 hover:bg-primary/10 text-primary transition-colors">
                <Upload className="w-3.5 h-3.5" /> Enviar
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

  const personalComplete = requiredPersonalKeys.every(k => docStates[k]?.uploaded);
  const depComplete = !hasDependents || requiredDependentKeys.every(k => docStates[k]?.uploaded);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-5 animate-fade-in">
        {/* Header */}
        <Card className="border-primary/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-4 mb-4">
              <img src={logo} alt="Logo" className="w-14 h-14 rounded-full object-contain bg-white shadow border-2 border-primary/20 p-0.5" />
              <div>
                <h1 className="text-lg font-bold text-foreground">Envio de Documentos</h1>
                <p className="text-sm text-foreground font-medium">{data.candidate_name}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Envie os documentos solicitados abaixo. Documentos marcados como <span className="text-destructive font-medium">obrigatórios</span> devem ser enviados para prosseguir.
            </p>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>Progresso geral</span>
              <span className="font-medium">{totalUploaded}/{totalDocs} documentos</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Válido até {new Date(data.expires_at).toLocaleDateString('pt-BR')}
            </p>
          </CardContent>
        </Card>

        {/* Documents */}
        <Accordion type="multiple" defaultValue={['pessoais', 'bancarios']}>
          {/* Personal */}
          <AccordionItem value="pessoais">
            <AccordionTrigger className="text-sm font-semibold px-1">
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Documentos Pessoais
                <Badge variant={personalComplete ? 'default' : 'outline'} className="text-[10px] ml-1">
                  {personalUploaded}/{PERSONAL_DOCS.length}
                </Badge>
                {personalComplete && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-1">
              {PERSONAL_DOCS.map(renderDocItem)}
            </AccordionContent>
          </AccordionItem>

          {/* Dependents */}
          <AccordionItem value="dependentes">
            <AccordionTrigger className="text-sm font-semibold px-1">
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Dependentes
                {hasDependents && (
                  <Badge variant={depComplete ? 'default' : 'outline'} className="text-[10px] ml-1">
                    {depUploaded}/{DEPENDENT_DOCS.length}
                  </Badge>
                )}
                {hasDependents && depComplete && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-1">
              <div className="flex items-center gap-3 mb-3 py-2 px-3 border border-border rounded-lg bg-muted/50">
                <Switch checked={hasDependents} onCheckedChange={setHasDependents} id="has-deps" />
                <Label htmlFor="has-deps" className="text-sm">Possui dependentes?</Label>
              </div>
              {hasDependents && DEPENDENT_DOCS.map(renderDocItem)}
              {!hasDependents && (
                <p className="text-xs text-muted-foreground py-2 px-3">Ative o toggle acima se possui dependentes.</p>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Banking */}
          <AccordionItem value="bancarios">
            <AccordionTrigger className="text-sm font-semibold px-1">
              <span className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                Dados Bancários
                {bankComplete && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-1">
              <Card className="border-border">
                <CardContent className="p-4 space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Informe os dados da conta onde receberá o pagamento. Todos os campos são obrigatórios.
                  </p>

                  {/* Bank select */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Banco <span className="text-destructive">*</span></Label>
                    <Select value={bankSelection} onValueChange={(v) => { setBankSelection(v); if (v !== '__outro__') setBankCustom(''); }}>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Selecione o banco" />
                      </SelectTrigger>
                      <SelectContent>
                        {BANK_LIST.map(b => (
                          <SelectItem key={b} value={b} className="text-sm">{b}</SelectItem>
                        ))}
                        <SelectItem value="__outro__" className="text-sm font-medium">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {bankSelection === '__outro__' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Informe o banco <span className="text-destructive">*</span></Label>
                      <Input
                        value={bankCustom}
                        onChange={e => setBankCustom(e.target.value)}
                        placeholder="Digite o nome do banco"
                        maxLength={60}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Agência <span className="text-destructive">*</span></Label>
                      <Input
                        value={bankInfo.agencia}
                        onChange={e => setBankInfo(p => ({ ...p, agencia: maskAgency(e.target.value) }))}
                        placeholder="0000-0"
                        maxLength={7}
                      />
                      <p className="text-[10px] text-muted-foreground">Apenas números, com dígito se houver</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Número da conta <span className="text-destructive">*</span></Label>
                      <Input
                        value={bankInfo.conta}
                        onChange={e => setBankInfo(p => ({ ...p, conta: maskAccount(e.target.value) }))}
                        placeholder="00000-0"
                        maxLength={15}
                      />
                      <p className="text-[10px] text-muted-foreground">Com dígito verificador</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Tipo de conta <span className="text-destructive">*</span></Label>
                    <Select value={bankInfo.tipo} onValueChange={v => setBankInfo(p => ({ ...p, tipo: v }))}>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="corrente">Conta Corrente</SelectItem>
                        <SelectItem value="poupanca">Conta Poupança</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Finalize */}
        <Card className="border-primary/20">
          <CardContent className="p-4 space-y-3">
            {!canFinalize && (
              <div className="text-xs text-muted-foreground space-y-1">
                {!allRequiredUploaded && (
                  <p className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-600" /> Envie todos os documentos obrigatórios
                  </p>
                )}
                {!bankComplete && (
                  <p className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-600" /> Preencha todos os dados bancários
                  </p>
                )}
              </div>
            )}
            <Button onClick={handleFinalize} disabled={!canFinalize || submitting} className="w-full gap-2" size="lg">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Finalizar Envio
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
