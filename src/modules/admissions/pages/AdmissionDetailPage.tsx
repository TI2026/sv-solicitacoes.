import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmissionRequest, useCandidates, useCreateCandidate, useAdmissionSetStatus, useUpdateCandidate, useMedicalExam, useGeneratePublicLink, useAdmissionPublicLinks, useAdmissionFiles } from '../hooks/useAdmissionQueries';
import { useApprovalRequestForReference, useApprovalRequestsForReference } from '@/hooks/useApprovalFlow';
import { ApprovalStatusBlock } from '@/components/ApprovalStatusBlock';
import { maskCPF, maskPhone, isValidCPF } from '@/lib/masks';
import { Switch } from '@/components/ui/switch';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusTimeline } from '@/components/StatusTimeline';
import { AdmissionStepper } from '../components/AdmissionStepper';
import { InterviewDialog } from '../components/InterviewDialog';
import { EditAdmissionDialog } from '../components/EditAdmissionDialog';
import { WelcomePdfGenerator } from '../components/WelcomePdfGenerator';
import { ExamAttachmentUpload } from '../components/ExamAttachmentUpload';
import { DynamicCategorySelect } from '@/components/DynamicCategorySelect';
import { ADMISSION_STATUS_LABELS, CANDIDATE_STATUS_LABELS, PRIORITY_LABELS, EXAM_STATUS_LABELS } from '@/lib/constants';
import { ArrowLeft, Loader2, UserPlus, Send, Link2, Copy, CheckCircle, XCircle, Clock, DollarSign, Calendar, User, CalendarClock, MapPin, AlertTriangle, Briefcase, Stethoscope, Ban, FileText, Upload, Download, Pencil, Video, ExternalLink, PackageOpen, HardHat } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toTimestampTZ, formatDateTimeBR, isDateTimePast } from '@/lib/dateUtils';
import { minDateToday } from '@/lib/masks';
import JSZip from 'jszip';
import { useCreateCollaboratorFromAdmission } from '@/modules/epis/hooks/useAdmissionToCollaborator';

// Document key labels for admin view
const DOC_KEY_LABELS: Record<string, string> = {
  RG_CNH: 'RG ou CNH', CPF: 'CPF', CTPS: 'CTPS Digital', RESIDENCIA: 'Comprovante de residência',
  CERTIDAO: 'Certidão nasc./casamento', TITULO_ELEITOR: 'Título de eleitor',
  QUITACAO_ELEITORAL: 'Quitação eleitoral', RESERVISTA: 'Certificado de reservista',
  PIS_PASEP: 'PIS/PASEP', DEP_CERTIDAO: 'Certidão (dependente)', DEP_CPF: 'CPF (dependente)',
  DEP_VACINA: 'Vacinação (dependente)', DEP_MATRICULA: 'Matrícula (dependente)',
  DEP_LAUDO: 'Laudo médico (dependente)', generic: 'Documento',
  CONTRATO_TRABALHO_ADMIN: 'Contrato de trabalho',
  FICHA_REGISTRO_ADMIN: 'Ficha de registro do empregado',
  DECLARACAO_DEPENDENTES_IRRF_ADMIN: 'Declaração de dependentes para IRRF',
  AUTORIZACAO_DESCONTO_VT_ADMIN: 'Autorização de desconto (VT, etc.)',
  TERMO_RESPONSABILIDADE_EQUIP_ADMIN: 'Termo de responsabilidade de equipamentos',
  TERMO_CONFIDENCIALIDADE_ADMIN: 'Termo de confidencialidade',
};

const ADMIN_SIGNATURE_DOCS: Array<{ key: string; label: string; optional: boolean }> = [
  { key: 'CONTRATO_TRABALHO_ADMIN', label: 'Contrato de trabalho', optional: false },
  { key: 'FICHA_REGISTRO_ADMIN', label: 'Ficha de registro do empregado', optional: false },
  { key: 'DECLARACAO_DEPENDENTES_IRRF_ADMIN', label: 'Declaração de dependentes para IRRF', optional: false },
  { key: 'AUTORIZACAO_DESCONTO_VT_ADMIN', label: 'Autorização de desconto (VT, etc.)', optional: false },
  { key: 'TERMO_RESPONSABILIDADE_EQUIP_ADMIN', label: 'Termo de responsabilidade de equipamentos', optional: true },
  { key: 'TERMO_CONFIDENCIALIDADE_ADMIN', label: 'Termo de confidencialidade', optional: true },
];

export default function AdmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: req, isLoading } = useAdmissionRequest(id!);
  const { data: approvalRequest } = useApprovalRequestForReference(id);
  const { data: allApprovalCycles } = useApprovalRequestsForReference(id);
  const previousCycles = (allApprovalCycles || []).slice(1);
  const { data: candidates } = useCandidates(id!);
  const createCandidate = useCreateCandidate();
  const updateCandidate = useUpdateCandidate();
  const statusMutation = useAdmissionSetStatus();
  const generatePublicLink = useGeneratePublicLink();

  const isRH = hasAnyRole(['diretoria', 'rh', 'administrativo']);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateForm, setCandidateForm] = useState({ nome: '', cpf: '', telefone: '', email: '', cidade: '' });
  const [editCandidateId, setEditCandidateId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [interviewCandidate, setInterviewCandidate] = useState<any | null>(null);
  const [generatedLinks, setGeneratedLinks] = useState<Record<string, string>>({});
  const [linksGenerating, setLinksGenerating] = useState(false);
  const [docsConfirmed, setDocsConfirmed] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  useRealtimeSubscription({
    channelName: `admission-detail-${id}`,
    enabled: !!id,
    tables: [
      { table: 'admission_requests', filter: `id=eq.${id}`, queryKeys: [['admission_request', id!], ['admission_requests'], ['adm_all']] },
      { table: 'candidates', filter: `admission_request_id=eq.${id}`, queryKeys: [['candidates', id!]] },
      { table: 'medical_exams', queryKeys: [['medical_exam']] },
      { table: 'candidate_documents', queryKeys: [['candidate_documents']] },
      { table: 'admission_public_links', filter: `admission_request_id=eq.${id}`, queryKeys: [['admission_public_links', id!]] },
      { table: 'admission_files', filter: `admission_request_id=eq.${id}`, queryKeys: [['admission_files', id!]] },
      { table: 'status_history', queryKeys: [['status_history']] },
      { table: 'notifications', queryKeys: [['notifications']] },
    ],
  });

  const handleStatusChange = async (toStatus: string, reason?: string) => {
    if (!id) return;
    await statusMutation.mutateAsync({ requestId: id, toStatus, reason });
  };

  const cpfDigits = candidateForm.cpf.replace(/\D/g, '');
  const phoneDigits = candidateForm.telefone.replace(/\D/g, '');
  const cpfError = cpfDigits.length > 0 && cpfDigits.length === 11 && !isValidCPF(cpfDigits) ? 'CPF inválido' : '';

  const handleAddCandidate = async () => {
    if (!id || !candidateForm.nome || createCandidate.isPending) return;
    if (cpfDigits.length > 0 && (cpfDigits.length !== 11 || !isValidCPF(cpfDigits))) {
      toast({ title: 'CPF inválido', variant: 'destructive' }); return;
    }

    // Duplicate check against existing candidates
    const existingCandidates = candidates || [];
    const normalizedEmail = candidateForm.email?.trim().toLowerCase();
    for (const existing of existingCandidates) {
      // Skip self when editing
      if (editCandidateId && existing.id === editCandidateId) continue;

      if (cpfDigits.length === 11 && existing.cpf && existing.cpf.replace(/\D/g, '') === cpfDigits) {
        toast({ title: 'Candidato duplicado', description: `Já existe um candidato com este CPF: ${existing.nome}`, variant: 'destructive' }); return;
      }
      if (normalizedEmail && existing.email && existing.email.trim().toLowerCase() === normalizedEmail) {
        toast({ title: 'Candidato duplicado', description: `Já existe um candidato com este e-mail: ${existing.nome}`, variant: 'destructive' }); return;
      }
      if (phoneDigits.length >= 10 && existing.telefone && existing.telefone.replace(/\D/g, '') === phoneDigits) {
        toast({ title: 'Candidato duplicado', description: `Já existe um candidato com este telefone: ${existing.nome}`, variant: 'destructive' }); return;
      }
    }

    if (editCandidateId) {
      await updateCandidate.mutateAsync({
        id: editCandidateId,
        data: {
          nome: candidateForm.nome,
          cpf: cpfDigits || null,
          telefone: phoneDigits || null,
          email: candidateForm.email || null,
          cidade: candidateForm.cidade || null,
        },
      });
      setEditCandidateId(null);
    } else {
      await createCandidate.mutateAsync({
        admission_request_id: id,
        nome: candidateForm.nome,
        cpf: cpfDigits || null,
        telefone: phoneDigits || null,
        email: candidateForm.email || null,
        cidade: candidateForm.cidade || null,
      });
    }
    setShowAddCandidate(false);
    setCandidateForm({ nome: '', cpf: '', telefone: '', email: '', cidade: '' });
  };

  const handleEditCandidate = (c: any) => {
    setEditCandidateId(c.id);
    setCandidateForm({
      nome: c.nome || '',
      cpf: c.cpf ? maskCPF(c.cpf) : '',
      telefone: c.telefone ? maskPhone(c.telefone) : '',
      email: c.email || '',
      cidade: c.cidade || '',
    });
    setShowAddCandidate(true);
  };

  const handleDeleteCandidate = async (candidateId: string) => {
    const { error } = await supabase.from('candidates').delete().eq('id', candidateId);
    if (error) toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    else {
      qc.invalidateQueries({ queryKey: ['candidates', id] });
      toast({ title: 'Candidato excluído' });
    }
    setShowDeleteConfirm(null);
  };

  const handleScheduleInterview = async (data: any) => {
    if (!interviewCandidate) return;
    await updateCandidate.mutateAsync({
      id: interviewCandidate.id,
      data: {
        interview_at: data.interview_at,
        interview_address: data.interview_address,
        interview_city: data.interview_city,
        interviewer_name: data.interviewer_name,
        interview_notes: data.interview_notes || null,
        interview_mode: data.interview_mode || 'presencial',
        meeting_link: data.meeting_link || null,
      },
    });
  };

  const handleInterviewResult = async (candidateId: string, approved: boolean) => {
    await updateCandidate.mutateAsync({
      id: candidateId,
      data: {
        interview_approved: approved,
        status_triagem: approved ? ('aprovado' as any) : ('reprovado' as any),
      },
    });
    toast({ title: approved ? 'Candidato aprovado na entrevista!' : 'Candidato eliminado' });
  };

  const handleConfirmInterview = async (candidateId: string) => {
    const currentUser = (await supabase.auth.getUser()).data.user;
    await updateCandidate.mutateAsync({
      id: candidateId,
      data: {
        interview_confirmed_at: new Date().toISOString(),
        interview_confirmed_by: currentUser?.id || null,
      },
    });
    toast({ title: 'Entrevista confirmada como realizada!' });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Link copiado!' });
  };

  // Derived state
  const activeCandidates = useMemo(() =>
    candidates?.filter((c: any) => c.status_triagem !== 'reprovado' && c.status_triagem !== 'desistente') || []
  , [candidates]);

  const approvedCandidates = useMemo(() =>
    candidates?.filter((c: any) => c.interview_approved === true) || []
  , [candidates]);

  const allActiveHaveInterviewResult = useMemo(() => {
    if (!candidates || candidates.length === 0) return false;
    const active = candidates.filter((c: any) => c.status_triagem !== 'desistente');
    return active.length > 0 && active.every((c: any) => c.interview_approved === true || c.interview_approved === false);
  }, [candidates]);

  const hasApprovedCandidates = approvedCandidates.length > 0;

  const isInterviewPast = (interviewAt: string | null): boolean => {
    return isDateTimePast(interviewAt);
  };

  const getInterviewStatusLabel = (c: any): { label: string; variant: string } => {
    if (!c.interview_at) return { label: 'Não agendada', variant: 'pending' };
    if (c.interview_approved === true) return { label: 'Aprovado', variant: 'approved' };
    if (c.interview_approved === false) return { label: 'Eliminado', variant: 'rejected' };
    if ((c as any).interview_confirmed_at) return { label: 'Realizada — aguardando decisão', variant: 'info' };
    if (!isInterviewPast(c.interview_at)) return { label: 'Aguardando data/hora', variant: 'info' };
    return { label: 'Liberado para decisão', variant: 'pending' };
  };

  const canDecideInterview = (c: any): boolean => {
    if (c.interview_approved != null) return false;
    if (!c.interview_at) return false;
    return isInterviewPast(c.interview_at) || !!(c as any).interview_confirmed_at;
  };

  const generateLinksForCandidates = async (linkType: 'DOCUMENTS' | 'SIGNATURE') => {
    if (!id || linksGenerating || approvedCandidates.length === 0) return;
    setLinksGenerating(true);
    const newLinks: Record<string, string> = {};
    const path = linkType === 'DOCUMENTS' ? '/envio-documentos' : '/assinatura-documentos';

    for (const c of approvedCandidates) {
      const key = `${linkType}-${c.id}`;
      if (generatedLinks[key]) { newLinks[key] = generatedLinks[key]; continue; }
      try {
        const result = await generatePublicLink.mutateAsync({
          admissionRequestId: id, candidateId: c.id, linkType,
        });
        if (result && 'token' in result && result.token) {
          newLinks[key] = `${window.location.origin}${path}?token=${result.token}`;
        } else if (result && 'alreadyExists' in result) {
          newLinks[key] = 'EXISTS';
        }
      } catch (e) { console.error('Link gen error:', e); }
    }
    setGeneratedLinks(prev => ({ ...prev, ...newLinks }));
    setLinksGenerating(false);
  };

  const status = req?.status;

  // Can edit: before triagem started
  const canEdit = isRH && status && !['concluido', 'cancelado', 'arquivado'].includes(status);

  useEffect(() => {
    if (status === 'documentos_em_analise' && approvedCandidates.length > 0) {
      generateLinksForCandidates('DOCUMENTS');
    }
  }, [status, approvedCandidates.length]);

  useEffect(() => {
    if (status === 'aguardando_registro' && approvedCandidates.length > 0) {
      generateLinksForCandidates('SIGNATURE');
    }
  }, [status, approvedCandidates.length]);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-60 w-full rounded-lg" />
      </div>
    );
  }
  if (!req) return <p className="text-center py-12 text-muted-foreground">Não encontrada</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
      <Button variant="ghost" className="gap-2" onClick={() => navigate('/admissions')}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">{req.cargo_funcao || 'Admissão'}</CardTitle>
            <div className="flex items-center gap-2">
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)} className="gap-1">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </Button>
              )}
              <StatusBadge status={req.status} label={ADMISSION_STATUS_LABELS[req.status] || req.status} />
              {(req as any).priority && (req as any).priority !== 'media' && (
                <StatusBadge
                  status={(req as any).priority === 'alta' ? 'rejeitado' : 'aprovado'}
                  label={`Prioridade ${PRIORITY_LABELS[(req as any).priority] || (req as any).priority}`}
                />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground"><DollarSign className="w-3.5 h-3.5" />R$ {req.salario_previsto ? Number(req.salario_previsto).toLocaleString('pt-BR') : '—'}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="w-3.5 h-3.5" />{req.data_prevista_inicio ? new Date(req.data_prevista_inicio).toLocaleDateString('pt-BR') : '—'}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground"><User className="w-3.5 h-3.5" />{(req as any).profiles?.full_name || '—'}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground"><Briefcase className="w-3.5 h-3.5" />{req.tipo_contrato || '—'}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="w-3.5 h-3.5" />{req.local_contratacao || '—'}</span>
          </div>
          {req.motivo && <p className="text-sm text-muted-foreground border-t border-border pt-2">{req.motivo}</p>}
        </CardContent>
      </Card>

      {/* Stepper */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Fluxo do Processo</h3>
          <AdmissionStepper
            status={req.status}
            candidateCount={candidates?.length || 0}
            hasInterview={candidates?.some((c: any) => c.interview_at) ?? false}
            hasDocuments={['aguardando_exame', 'exame_realizado', 'aguardando_registro', 'registros_concluidos', 'concluido'].includes(status!)}
            hasExam={['aguardando_registro', 'registros_concluidos', 'concluido'].includes(status!)}
            hasRegistration={['concluido'].includes(status!)}
          />
        </CardContent>
      </Card>

      {/* ===== ETAPA 0: Enviar para triagem ===== */}
      {req.requester_user_id === user?.id && status === 'rascunho' && (
        <Card>
          <CardContent className="p-4">
            <Button onClick={() => handleStatusChange('aguardando_triagem')} className="gap-2">
              <Send className="w-4 h-4" /> Enviar para Triagem
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ===== ETAPA 1: Iniciar Triagem ===== */}
      {isRH && status === 'aguardando_triagem' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Etapa 1 — Iniciar Triagem</h3>
            <Button onClick={() => handleStatusChange('em_triagem')} className="gap-2" size="sm">
              <Clock className="w-4 h-4" /> Iniciar Triagem
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ===== ETAPA 1b: Candidatos (em_triagem) ===== */}
      {isRH && status === 'em_triagem' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Etapa 1 — Triagem + Candidatos ({candidates?.length || 0})</h3>
              <Button variant="outline" size="sm" onClick={() => setShowAddCandidate(true)} className="gap-1">
                <UserPlus className="w-3 h-3" /> Adicionar
              </Button>
            </div>

            {!candidates || candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum candidato cadastrado. Adicione ao menos 1 candidato.</p>
            ) : (
              <div className="space-y-2">
                {candidates.map((c: any) => (
                  <div key={c.id} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.nome}</p>
                        <p className="text-xs text-muted-foreground">{c.cpf ? maskCPF(c.cpf) : ''} {c.telefone ? maskPhone(c.telefone) : c.email || '—'} {c.cidade && `· ${c.cidade}`}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <StatusBadge status={c.status_triagem} label={CANDIDATE_STATUS_LABELS[c.status_triagem] || c.status_triagem} />
                        <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => handleEditCandidate(c)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-1.5 text-destructive" onClick={() => setShowDeleteConfirm(c.id)}>
                          <XCircle className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {showDeleteConfirm === c.id && (
                      <div className="mt-2 p-2 bg-destructive/10 rounded flex items-center justify-between">
                        <span className="text-xs text-destructive">Confirmar exclusão?</span>
                        <div className="flex gap-1">
                          <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => handleDeleteCandidate(c.id)}>Sim</Button>
                          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setShowDeleteConfirm(null)}>Não</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(candidates?.length || 0) > 0 && (
              <Button onClick={() => handleStatusChange('aguardando_documentos')} className="gap-2 w-full" size="sm">
                <CheckCircle className="w-4 h-4" /> Concluir candidatos e avançar para Entrevista
              </Button>
            )}

            <Button onClick={() => handleStatusChange('cancelado')} variant="destructive" size="sm" className="gap-2">
              <XCircle className="w-4 h-4" /> Cancelar Processo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ===== ETAPA 2: Entrevista (aguardando_documentos) ===== */}
      {isRH && status === 'aguardando_documentos' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Etapa 2 — Entrevista</h3>
            <p className="text-xs text-muted-foreground">
              Agende a entrevista para cada candidato. Após a data/hora (ou confirmação), decida: Continuar ou Eliminar.
            </p>

            {candidates?.map((c: any) => {
              if (c.status_triagem === 'reprovado' || c.status_triagem === 'desistente') return null;
              const interviewStatus = getInterviewStatusLabel(c);
              const canDecide = canDecideInterview(c);
              const isOnline = (c as any).interview_mode === 'online';
              const meetingLink = (c as any).meeting_link;
              const isConfirmed = !!(c as any).interview_confirmed_at;
              const isPast = c.interview_at && isInterviewPast(c.interview_at);
              const canConfirm = c.interview_at && c.interview_approved == null && !isConfirmed;

              return (
                <div key={c.id} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.nome}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          interviewStatus.variant === 'approved' ? 'status-approved' :
                          interviewStatus.variant === 'rejected' ? 'status-rejected' :
                          interviewStatus.variant === 'info' ? 'status-info' : 'status-pending'
                        }`}>
                          {interviewStatus.variant === 'approved' && <CheckCircle className="w-3 h-3" />}
                          {interviewStatus.variant === 'rejected' && <XCircle className="w-3 h-3" />}
                          {interviewStatus.variant === 'info' && <Clock className="w-3 h-3" />}
                          {interviewStatus.label}
                        </span>
                        {isOnline && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium status-info">
                            <Video className="w-3 h-3" /> Online
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {c.interview_at && (
                    <div className="bg-muted/50 rounded-lg p-2 text-xs text-muted-foreground space-y-0.5">
                      <p className="flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {formatDateTimeBR(c.interview_at)}</p>
                      {!isOnline && c.interview_address && <p className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {c.interview_address}{c.interview_city ? `, ${c.interview_city}` : ''}</p>}
                      {isOnline && meetingLink && (
                        <div className="flex items-center gap-2 mt-1">
                          <Video className="w-3 h-3 text-primary" />
                          <a href={meetingLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate max-w-[200px]">
                            {meetingLink}
                          </a>
                          <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => copyToClipboard(meetingLink)}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      {c.interviewer_name && <p className="flex items-center gap-1"><User className="w-3 h-3" /> {c.interviewer_name}</p>}
                      {isConfirmed && (
                        <p className="flex items-center gap-1 text-primary font-medium mt-1">
                          <CheckCircle className="w-3 h-3" /> Entrevista confirmada como realizada
                        </p>
                      )}
                      {!isPast && !isConfirmed && c.interview_approved == null && (
                        <p className="flex items-center gap-1 text-[hsl(var(--status-info-foreground))] font-medium mt-1">
                          <Clock className="w-3 h-3" /> Entrevista ainda não ocorreu. Aguarde a data/hora.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-1 flex-wrap">
                    {(!c.interview_at || (c.interview_approved == null && !isPast && !isConfirmed)) && (
                      <Button variant="ghost" size="sm" onClick={() => setInterviewCandidate(c)} className="gap-1 text-xs">
                        <CalendarClock className="w-3 h-3" /> {c.interview_at ? 'Reagendar' : 'Agendar Entrevista'}
                      </Button>
                    )}

                    {canConfirm && !isPast && !isConfirmed && (
                      <Button variant="outline" size="sm" onClick={() => handleConfirmInterview(c.id)} className="gap-1 text-xs">
                        <CheckCircle className="w-3 h-3" /> Confirmar Entrevista Realizada
                      </Button>
                    )}

                    {canDecide && (
                      <>
                        <Button variant="default" size="sm" onClick={() => handleInterviewResult(c.id, true)} className="text-xs gap-1">
                          <CheckCircle className="w-3 h-3" /> Continuar
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleInterviewResult(c.id, false)} className="text-xs gap-1">
                          <Ban className="w-3 h-3" /> Eliminar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {allActiveHaveInterviewResult && hasApprovedCandidates && (
              <Button onClick={() => handleStatusChange('documentos_em_analise')} className="gap-2 w-full" size="sm">
                <CheckCircle className="w-4 h-4" /> Avançar aprovados para Documentos
              </Button>
            )}

            {allActiveHaveInterviewResult && !hasApprovedCandidates && (
              <div className="text-center py-3">
                <p className="text-xs text-destructive flex items-center justify-center gap-1 mb-2">
                  <AlertTriangle className="w-3 h-3" /> Nenhum candidato aprovado.
                </p>
                <Button onClick={() => handleStatusChange('cancelado')} variant="destructive" size="sm" className="gap-2">
                  <XCircle className="w-4 h-4" /> Encerrar processo
                </Button>
              </div>
            )}

            {!allActiveHaveInterviewResult && (
              <p className="text-xs text-muted-foreground text-center py-2">
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                Registre o resultado (Continuar/Eliminar) para todos os candidatos após a data da entrevista.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ===== ETAPA 3: Documentos - Link Externo (documentos_em_analise) ===== */}
      {isRH && status === 'documentos_em_analise' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4" /> Etapa 3 — Documentos (Link Externo)
            </h3>
            <p className="text-xs text-muted-foreground">
              Links gerados automaticamente. O candidato envia cada documento individualmente (CPF, RG, CTPS, etc.)
            </p>

            {approvedCandidates.map((c: any) => {
              const linkKey = `DOCUMENTS-${c.id}`;
              const link = generatedLinks[linkKey];
              return (
                <div key={c.id} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{c.nome}</p>
                    <CandidateDocStatus admissionId={id!} candidateId={c.id} />
                  </div>
                  {link && link !== 'EXISTS' ? (
                    <div className="flex gap-2 items-center flex-wrap">
                      <Button size="sm" className="gap-1 text-xs" onClick={() => window.open(link, '_blank')}>
                        <ExternalLink className="w-3 h-3" /> Abrir link de documentos
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(link)} className="gap-1 text-xs shrink-0">
                        <Copy className="w-3 h-3" /> Copiar
                      </Button>
                    </div>
                  ) : link === 'EXISTS' ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span className="text-xs text-muted-foreground">Link já gerado anteriormente (válido).</span>
                      <Button variant="ghost" size="sm" className="text-xs" onClick={async () => {
                        await generatePublicLink.mutateAsync({
                          admissionRequestId: id!, candidateId: c.id, linkType: 'DOCUMENTS',
                        });
                      }}>
                        <Link2 className="w-3 h-3 mr-1" /> Regenerar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">Gerando link...</span>
                    </div>
                  )}
                  <CandidateFilesList admissionId={id!} candidateId={c.id} linkType="DOCUMENTS" />
                </div>
              );
            })}

            {/* Download all as ZIP */}
            <DownloadAllZip admissionId={id!} linkType="DOCUMENTS" candidateIds={approvedCandidates.map((c: any) => c.id)} label="documentos" />

            {Object.keys(generatedLinks).some(k => k.startsWith('DOCUMENTS-')) && (
              <>
                <div className="flex items-center gap-3 pt-2">
                  <Checkbox
                    id="docs-confirmed"
                    checked={docsConfirmed}
                    onCheckedChange={(checked) => setDocsConfirmed(!!checked)}
                  />
                  <Label htmlFor="docs-confirmed" className="text-sm">
                    Confirmar recebimento de todos os documentos
                  </Label>
                </div>
                <Button
                  onClick={() => handleStatusChange('aguardando_exame')}
                  disabled={!docsConfirmed || statusMutation.isPending}
                  className="gap-2 w-full"
                  size="sm"
                >
                  {statusMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <CheckCircle className="w-4 h-4" /> Confirmar e Avançar para Exame
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ===== ETAPA 4: Exame Admissional (aguardando_exame / exame_realizado) ===== */}
      {isRH && (status === 'aguardando_exame' || status === 'exame_realizado') && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Stethoscope className="w-4 h-4" /> Etapa 4 — Exame Admissional
            </h3>
            <p className="text-xs text-muted-foreground">
              Selecione a clínica, data e hora. Após a data/hora, registre o resultado. O exame deve ser anexado antes de avançar.
            </p>

            {approvedCandidates.map((c: any) => (
              <ExamSection key={c.id} candidateId={c.id} candidateName={c.nome} admissionId={id!} currentStatus={status!} onAdvance={() => handleStatusChange('aguardando_registro')} onExamResultRegistered={() => handleStatusChange('exame_realizado')} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ===== ETAPA 5: Assinatura - Link Externo (aguardando_registro) ===== */}
      {isRH && status === 'aguardando_registro' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Link2 className="w-4 h-4" /> Etapa 5 — Assinatura (Link Externo)
            </h3>
            <p className="text-xs text-muted-foreground">
              Faça upload dos documentos internos para assinatura. Gere o link e envie ao candidato para baixar, assinar via CDGov e reenviar.
            </p>

            {approvedCandidates.map((c: any) => {
              const linkKey = `SIGNATURE-${c.id}`;
              const link = generatedLinks[linkKey];
              return (
                <SignatureSection
                  key={c.id}
                  admissionId={id!}
                  candidateId={c.id}
                  candidateName={c.nome}
                  link={link && link !== 'EXISTS' ? link : undefined}
                  linkExists={link === 'EXISTS'}
                  onCopyLink={() => link && link !== 'EXISTS' && copyToClipboard(link)}
                />
              );
            })}

            {/* Download all as ZIP */}
            <DownloadAllZip admissionId={id!} linkType="SIGNATURE" candidateIds={approvedCandidates.map((c: any) => c.id)} label="assinaturas" />

            <Button onClick={() => handleStatusChange('concluido')} className="gap-2 w-full" size="sm">
              <CheckCircle className="w-4 h-4" /> Concluir Admissão
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ===== ETAPA 6: Concluído ===== */}
      {(status === 'concluido' || status === 'registros_concluidos') && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-4">
            <div className="text-center">
              <CheckCircle className="w-8 h-8 mx-auto text-primary mb-2" />
              <p className="text-sm font-semibold text-foreground">Admissão Concluída — Admitido</p>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Cargo: {req.cargo_funcao}</p>
              <p>Local: {req.local_contratacao}</p>
              {req.data_prevista_inicio && <p>Início previsto: {new Date(req.data_prevista_inicio).toLocaleDateString('pt-BR')}</p>}
              {approvedCandidates.length > 0 && (
                <p>Contratado(s): {approvedCandidates.map((c: any) => c.nome).join(', ')}</p>
              )}
            </div>
            {/* Welcome PDF Generator + EPI buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {approvedCandidates.map((c: any) => (
                <WelcomePdfGenerator
                  key={c.id}
                  candidateName={c.nome}
                  cargoFuncao={req.cargo_funcao}
                  admissionId={id!}
                  defaultLocal={req.local_contratacao}
                  defaultResponsavel={req.gestor_responsavel}
                  dataPrevistaInicio={req.data_prevista_inicio}
                />
              ))}
              <CreateCollaboratorFromAdmissionButton admissionId={id!} candidates={approvedCandidates} cargoFuncao={req.cargo_funcao} worksite={req.local_contratacao} uniformSizes={(req as any).uniform_sizes || {}} />
              <StartEpiDeliveryButton admissionId={id!} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit candidate dialog */}
      <Dialog open={showAddCandidate} onOpenChange={(open) => { if (!open) { setShowAddCandidate(false); setEditCandidateId(null); setCandidateForm({ nome: '', cpf: '', telefone: '', email: '', cidade: '' }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editCandidateId ? 'Editar Candidato' : 'Adicionar Candidato'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nome *</Label><Input value={candidateForm.nome} onChange={e => setCandidateForm(p => ({ ...p, nome: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>CPF</Label>
                <Input
                  value={candidateForm.cpf}
                  onChange={e => setCandidateForm(p => ({ ...p, cpf: maskCPF(e.target.value) }))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
                {cpfError && <p className="text-xs text-destructive">{cpfError}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input
                  value={candidateForm.telefone}
                  onChange={e => setCandidateForm(p => ({ ...p, telefone: maskPhone(e.target.value) }))}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                />
              </div>
            </div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={candidateForm.email} onChange={e => setCandidateForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Cidade</Label><Input value={candidateForm.cidade} onChange={e => setCandidateForm(p => ({ ...p, cidade: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddCandidate(false); setEditCandidateId(null); }}>Cancelar</Button>
            <Button onClick={handleAddCandidate} disabled={!candidateForm.nome || createCandidate.isPending || updateCandidate.isPending || !!cpfError}>
              {(createCandidate.isPending || updateCandidate.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editCandidateId ? 'Atualizar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interview dialog */}
      {interviewCandidate && (
        <InterviewDialog
          open={!!interviewCandidate}
          onOpenChange={() => setInterviewCandidate(null)}
          candidateName={interviewCandidate.nome}
          onSave={handleScheduleInterview}
        />
      )}

      {/* Edit admission dialog */}
      {showEditDialog && req && (
        <EditAdmissionDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          admission={req}
        />
      )}

      {/* Approval Flow Status */}
      {approvalRequest && <ApprovalStatusBlock approvalRequest={approvalRequest} previousCycles={previousCycles} />}

      {/* Timeline */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Histórico</h3>
          <StatusTimeline entityId={id!} entityType="admission_requests" module="admissions" statusLabels={ADMISSION_STATUS_LABELS} />
        </CardContent>
      </Card>
    </div>
  );
}

// ===== CandidateDocStatus: Shows uploaded doc count =====
function CandidateDocStatus({ admissionId, candidateId }: { admissionId: string; candidateId: string }) {
  const { data: files } = useAdmissionFiles(admissionId, 'DOCUMENTS');
  const candidateFiles = files?.filter(f => f.candidate_id === candidateId) || [];
  if (candidateFiles.length === 0) return <span className="text-xs text-muted-foreground">Pendente</span>;
  return <span className="text-xs text-primary font-medium">{candidateFiles.length} doc(s) recebido(s)</span>;
}

// ===== CandidateFilesList: List files grouped by doc_key with download =====
function CandidateFilesList({ admissionId, candidateId, linkType }: { admissionId: string; candidateId: string; linkType: 'DOCUMENTS' | 'SIGNATURE' }) {
  const { data: files } = useAdmissionFiles(admissionId, linkType);
  const candidateFiles = files?.filter(f => f.candidate_id === candidateId) || [];
  const { toast } = useToast();

  const handleDownload = async (storagePath: string) => {
    const { data, error } = await supabase.storage.from('admissions').createSignedUrl(storagePath, 3600);
    if (error || !data) {
      toast({ title: 'Erro ao gerar download', variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  if (candidateFiles.length === 0) return null;

  const grouped = candidateFiles.reduce<Record<string, typeof candidateFiles>>((acc, f) => {
    const key = f.file_type || 'generic';
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-1 pt-1">
      <p className="text-[10px] font-medium text-muted-foreground uppercase">Arquivos recebidos</p>
      {Object.entries(grouped).map(([docKey, docFiles]) => (
        <div key={docKey} className="space-y-0.5">
          <p className="text-[10px] font-semibold text-foreground">{DOC_KEY_LABELS[docKey] || docKey}</p>
          {docFiles.map(f => (
            <div key={f.id} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
              <span className="flex items-center gap-1 truncate">
                <FileText className="w-3 h-3 text-muted-foreground" />
                {f.original_filename || f.storage_path.split('/').pop()}
              </span>
              <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => handleDownload(f.storage_path)}>
                <Download className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ===== DownloadAllZip: Download all files for a link type as ZIP =====
function DownloadAllZip({ admissionId, linkType, candidateIds, label }: { admissionId: string; linkType: 'DOCUMENTS' | 'SIGNATURE'; candidateIds: string[]; label: string }) {
  const { data: files } = useAdmissionFiles(admissionId, linkType);
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const relevantFiles = files?.filter(f => candidateIds.includes(f.candidate_id)) || [];

  if (relevantFiles.length === 0) return null;

  const handleDownloadZip = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();
      for (const f of relevantFiles) {
        const { data, error } = await supabase.storage.from('admissions').createSignedUrl(f.storage_path, 3600);
        if (error || !data?.signedUrl) continue;
        const response = await fetch(data.signedUrl);
        if (!response.ok) continue;
        const blob = await response.blob();
        const fileName = f.original_filename || f.storage_path.split('/').pop() || 'arquivo';
        const docLabel = DOC_KEY_LABELS[f.file_type] || f.file_type || '';
        zip.file(`${docLabel ? docLabel + '_' : ''}${fileName}`, blob);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${label}-${admissionId.slice(0, 8)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'ZIP baixado com sucesso!' });
    } catch (err: any) {
      toast({ title: 'Erro ao gerar ZIP', description: err.message, variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleDownloadZip} disabled={downloading} className="gap-2 w-full">
      {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageOpen className="w-4 h-4" />}
      Baixar todos em ZIP ({relevantFiles.length} arquivo{relevantFiles.length !== 1 ? 's' : ''})
    </Button>
  );
}

// ===== ExamSection: Clinic via DynamicCategory + date/time + result + auto-unlock timer + attachment + block advance without attachment =====
function ExamSection({ candidateId, candidateName, admissionId, currentStatus, onAdvance, onExamResultRegistered }: {
  candidateId: string; candidateName: string; admissionId: string; currentStatus: string; onAdvance: () => void; onExamResultRegistered?: () => void;
}) {
  const { data: exam } = useMedicalExam(candidateId);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [clinicName, setClinicName] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examTime, setExamTime] = useState('');
  const [examNotes, setExamNotes] = useState('');
  const [now, setNow] = useState(new Date());

  useRealtimeSubscription({
    channelName: `exam-${candidateId}`,
    enabled: !!candidateId,
    tables: [
      { table: 'medical_exams', filter: `candidate_id=eq.${candidateId}`, queryKeys: [['medical_exam', candidateId]] },
    ],
  });

  useEffect(() => {
    if (!exam?.scheduled_at) return;
    const scheduled = new Date(exam.scheduled_at);
    const diff = scheduled.getTime() - Date.now();
    if (diff <= 0) { setNow(new Date()); return; }
    const timer = setTimeout(() => {
      setNow(new Date());
      qc.invalidateQueries({ queryKey: ['medical_exam', candidateId] });
    }, diff + 1000);
    return () => clearTimeout(timer);
  }, [exam?.scheduled_at, candidateId, qc]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateExam = async () => {
    if (!clinicName || !examDate || !examTime) {
      toast({ title: 'Preencha clínica, data e hora', variant: 'destructive' });
      return;
    }
    if (examDate < minDateToday()) {
      toast({ title: 'A data do exame deve ser hoje ou uma data futura.', variant: 'destructive' });
      return;
    }
    const scheduledAt = toTimestampTZ(examDate, examTime);
    const { error } = await supabase.from('medical_exams').insert({
      candidate_id: candidateId,
      clinic_id: null,
      clinic_name: clinicName,
      scheduled_at: scheduledAt,
      restrictions: examNotes || null,
    } as any);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Exame agendado' });
      qc.invalidateQueries({ queryKey: ['medical_exam', candidateId] });
    }
  };

  const handleExamResult = async (result: string) => {
    if (!exam) return;
    const { error } = await supabase.from('medical_exams').update({ status: result as any }).eq('id', exam.id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Resultado registrado' });
      qc.invalidateQueries({ queryKey: ['medical_exam', candidateId] });
      if (currentStatus === 'aguardando_exame') {
        onExamResultRegistered?.();
      }
    }
  };

  const isExamPast = exam?.scheduled_at ? new Date(exam.scheduled_at) <= now : false;
  const examResolved = exam?.status && exam.status !== 'aguardando';

  const getTimeRemaining = () => {
    if (!exam?.scheduled_at) return '';
    const diff = new Date(exam.scheduled_at).getTime() - now.getTime();
    if (diff <= 0) return '';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours > 24) return `Faltam ${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `Faltam ${hours}h ${mins}min`;
    return `Faltam ${mins}min`;
  };

  // Check if exam attachment exists - block advance without it
  const { data: examFiles } = useAdmissionFiles(admissionId, 'EXAM');
  const hasExamAttachment = (examFiles || []).some(f => f.candidate_id === candidateId);
  const canAdvance = examResolved && isExamPast && hasExamAttachment;

  return (
    <div className="border border-border rounded-lg p-3 space-y-3">
      <p className="text-sm font-medium">{candidateName}</p>
      {exam ? (
        <div className="space-y-3">
          {/* Sub-step A: Agendamento (info) */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">A — Agendamento</p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Clínica: {(exam as any).clinic_name || (exam as any).clinics?.nome || '—'}</p>
              <p>Data: {formatDateTimeBR(exam.scheduled_at)}</p>
            </div>
          </div>

          {/* Sub-step B: Resultado */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">B — Resultado</p>
            <StatusBadge status={exam.status} label={EXAM_STATUS_LABELS[exam.status] || exam.status} />
            {exam.status === 'aguardando' && !isExamPast && (
              <div className="mt-1 space-y-0.5">
                <p className="flex items-center gap-1 text-xs text-[hsl(var(--status-info-foreground))]">
                  <Clock className="w-3 h-3" /> Aguardando data/hora do exame
                </p>
                {getTimeRemaining() && (
                  <p className="text-[10px] text-muted-foreground">{getTimeRemaining()}</p>
                )}
              </div>
            )}
            {isExamPast && exam.status === 'aguardando' && (
              <>
                <p className="flex items-center gap-1 text-xs text-primary font-medium mt-1">
                  <CheckCircle className="w-3 h-3" /> Liberado — registre o resultado
                </p>
                <div className="flex gap-2 flex-wrap mt-1">
                  <Button size="sm" onClick={() => handleExamResult('apto')} className="gap-1"><CheckCircle className="w-3 h-3" /> Apto</Button>
                  <Button size="sm" variant="outline" onClick={() => handleExamResult('apto_com_restricao')}>Apto c/ Restrição</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleExamResult('inapto')}>Inapto</Button>
                </div>
              </>
            )}
          </div>

          {/* Sub-step C: Anexo do Exame — only after result is registered */}
          {examResolved && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">C — Anexo do Exame</p>
              <ExamAttachmentUpload admissionId={admissionId} candidateId={candidateId} />
            </div>
          )}

          {/* Sub-step D: Avanço — always visible when exam exists */}
          <div className="space-y-1 pt-2 border-t border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">D — Avançar</p>
            {!isExamPast && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Aguarde a data/hora do exame para prosseguir.
              </p>
            )}
            {isExamPast && !examResolved && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-destructive" /> Registre o resultado do exame antes de avançar.
              </p>
            )}
            {examResolved && !hasExamAttachment && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Anexe o exame admissional antes de avançar.
              </p>
            )}
            <Button
              onClick={onAdvance}
              disabled={!canAdvance}
              className="gap-2 w-full"
              size="sm"
            >
              <CheckCircle className="w-4 h-4" /> Avançar para Assinatura
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">A — Agendar Exame</p>
          <div className="space-y-1.5">
            <Label className="text-xs">Nome da clínica *</Label>
            <DynamicCategorySelect
              module="admissions"
              fieldKey="clinic_name"
              value={clinicName}
              onValueChange={setClinicName}
              placeholder="Selecione ou adicione"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Data *</Label>
              <Input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} min={minDateToday()} />
              {examDate && examDate < minDateToday() && (
                <p className="text-xs text-destructive">A data do exame deve ser hoje ou uma data futura.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Hora *</Label>
              <Input type="time" value={examTime} onChange={e => setExamTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Observações</Label>
            <Input value={examNotes} onChange={e => setExamNotes(e.target.value)} placeholder="Opcional" />
          </div>
          <Button size="sm" onClick={handleCreateExam} disabled={!clinicName || !examDate || !examTime || examDate < minDateToday()}>
            <Stethoscope className="w-3 h-3 mr-1" /> Agendar Exame
          </Button>
        </div>
      )}
    </div>
  );
}

// ===== SignatureSection: Admin upload per doc_key slot + candidate link =====
function SignatureSection({ admissionId, candidateId, candidateName, link, linkExists, onCopyLink }: {
  admissionId: string;
  candidateId: string;
  candidateName: string;
  link?: string;
  linkExists?: boolean;
  onCopyLink: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState<string | null>(null);
  const { data: files } = useAdmissionFiles(admissionId, 'SIGNATURE');
  const adminFiles = files?.filter(f => f.candidate_id === candidateId && f.uploaded_by === 'ADMIN') || [];
  const signedFiles = files?.filter(f => f.candidate_id === candidateId && f.uploaded_by === 'CANDIDATE') || [];
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});

  const getFileForKey = (docKey: string) => adminFiles.find(f => f.file_type === docKey);

  const handleAdminUpload = async (file: File, docKey: string) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande (máx. 10MB)', variant: 'destructive' });
      return;
    }
    setUploading(docKey);
    const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `signature/admin/${admissionId}/${candidateId}/${docKey}-${Date.now()}-${sanitized}`;

    const existing = getFileForKey(docKey);
    if (existing) {
      await supabase.storage.from('admissions').remove([existing.storage_path]);
      await supabase.from('admission_files').delete().eq('id', existing.id);
    }

    const { error } = await supabase.storage.from('admissions').upload(path, file);
    if (error) {
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
    } else {
      await supabase.from('admission_files').insert({
        admission_request_id: admissionId,
        candidate_id: candidateId,
        file_type: docKey,
        storage_path: path,
        original_filename: sanitized,
        uploaded_by: 'ADMIN',
        link_type: 'SIGNATURE',
      } as any);
      toast({ title: 'Documento anexado!' });
      qc.invalidateQueries({ queryKey: ['admission_files', admissionId] });
    }
    setUploading(null);
  };

  const handleDownload = async (storagePath: string) => {
    const { data, error } = await supabase.storage.from('admissions').createSignedUrl(storagePath, 3600);
    if (error || !data) {
      toast({ title: 'Erro ao gerar download', variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-3">
      <p className="text-sm font-medium">{candidateName}</p>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">Documentos internos (para o candidato assinar)</Label>
        {ADMIN_SIGNATURE_DOCS.map(doc => {
          const existingFile = getFileForKey(doc.key);
          const isSkipped = skipped[doc.key] || false;
          const isUploading = uploading === doc.key;

          return (
            <div key={doc.key} className="border border-border rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">{doc.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {doc.optional && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Aplicável?</span>
                      <Switch
                        checked={!isSkipped}
                        onCheckedChange={v => setSkipped(prev => ({ ...prev, [doc.key]: !v }))}
                        className="scale-75"
                      />
                    </div>
                  )}
                  {existingFile ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium status-approved">
                      <CheckCircle className="w-3 h-3" /> Anexado
                    </span>
                  ) : isSkipped ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">N/A</span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium status-pending">Pendente</span>
                  )}
                </div>
              </div>

              {!isSkipped && (
                <>
                  {existingFile && (
                    <div className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
                      <span className="flex items-center gap-1 truncate">
                        <FileText className="w-3 h-3 text-muted-foreground" />
                        {existingFile.original_filename || 'doc'}
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => handleDownload(existingFile.storage_path)}>
                        <Download className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept=".pdf"
                      disabled={isUploading}
                      onChange={e => { if (e.target.files?.[0]) handleAdminUpload(e.target.files[0], doc.key); }}
                      className="text-xs h-8"
                    />
                    {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {signedFiles.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs font-semibold uppercase text-primary">Documentos assinados recebidos</Label>
          {signedFiles.map(f => (
            <div key={f.id} className="flex items-center justify-between text-xs bg-primary/5 rounded px-2 py-1">
              <span className="flex items-center gap-1 truncate">
                <CheckCircle className="w-3 h-3 text-primary" /> {f.original_filename || 'doc'}
              </span>
              <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => handleDownload(f.storage_path)}>
                <Download className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {link ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Link para o candidato</Label>
          <div className="flex gap-2 items-center flex-wrap">
            <Button size="sm" className="gap-1 text-xs" onClick={() => window.open(link, '_blank')}>
              <ExternalLink className="w-3 h-3" /> Abrir link de assinatura
            </Button>
            <Button variant="outline" size="sm" onClick={onCopyLink} className="gap-1 text-xs shrink-0">
              <Copy className="w-3 h-3" /> Copiar
            </Button>
          </div>
        </div>
      ) : linkExists ? (
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-primary" />
          <span className="text-xs text-muted-foreground">Link já gerado anteriormente (válido).</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Gerando link de assinatura...</span>
        </div>
      )}
    </div>
  );
}

function CreateCollaboratorFromAdmissionButton({ admissionId, candidates, cargoFuncao, worksite, uniformSizes }: { admissionId: string; candidates: any[]; cargoFuncao: string; worksite: string; uniformSizes?: Record<string, string> }) {
  const createCollab = useCreateCollaboratorFromAdmission();
  const [done, setDone] = useState(false);

  const handleCreate = async () => {
    for (const c of candidates) {
      await createCollab.mutateAsync({
        full_name: c.nome,
        cpf: c.cpf || null,
        role_name: cargoFuncao,
        worksite,
        admission_request_id: admissionId,
        uniform_sizes: uniformSizes || {},
      });
    }
    setDone(true);
  };

  if (done) return <p className="text-xs text-primary flex items-center gap-1"><HardHat className="w-3.5 h-3.5" /> Colaborador(es) criado(s) no módulo de EPIs</p>;

  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCreate} disabled={createCollab.isPending || candidates.length === 0}>
      {createCollab.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardHat className="w-4 h-4" />}
      Criar Colaborador p/ EPIs
    </Button>
  );
}

function StartEpiDeliveryButton({ admissionId }: { admissionId: string }) {
  const navigate = useNavigate();
  const [collabId, setCollabId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase
      .from('collaborators')
      .select('id')
      .eq('admission_request_id', admissionId)
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setCollabId(data[0].id);
        setChecked(true);
      });
  }, [admissionId]);

  if (!checked || !collabId) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => navigate(`/epis/deliveries?collaboratorId=${collabId}`)}
    >
      <PackageOpen className="w-4 h-4" /> Iniciar Entrega de EPIs
    </Button>
  );
}
