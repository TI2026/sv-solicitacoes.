import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmissionRequest, useCandidates, useCreateCandidate, useAdmissionSetStatus, useGenerateToken, useUpdateCandidate, useMedicalExam, useClinics } from '../hooks/useAdmissionQueries';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusTimeline } from '@/components/StatusTimeline';
import { AdmissionStepper } from '../components/AdmissionStepper';
import { InterviewDialog } from '../components/InterviewDialog';
import { ADMISSION_STATUS_LABELS, CANDIDATE_STATUS_LABELS, PRIORITY_LABELS, EXAM_STATUS_LABELS } from '@/lib/constants';
import { ArrowLeft, Loader2, UserPlus, Send, Link2, Copy, CheckCircle, XCircle, Clock, Building2, DollarSign, Calendar, User, CalendarClock, MapPin, AlertTriangle, Briefcase, Stethoscope, MessageCircle, Ban } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

export default function AdmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const { data: req, isLoading } = useAdmissionRequest(id!);
  const { data: candidates } = useCandidates(id!);
  const createCandidate = useCreateCandidate();
  const updateCandidate = useUpdateCandidate();
  const statusMutation = useAdmissionSetStatus();
  const generateToken = useGenerateToken();

  const isRH = hasAnyRole(['diretoria', 'rh', 'administrativo']);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateForm, setCandidateForm] = useState({ nome: '', cpf: '', telefone: '', email: '', cidade: '' });
  const [tokenLink, setTokenLink] = useState<string | null>(null);
  const [interviewCandidate, setInterviewCandidate] = useState<any | null>(null);
  const [docsConfirmed, setDocsConfirmed] = useState(false);

  // Exam state
  const [examCandidateId, setExamCandidateId] = useState<string | null>(null);
  const [examClinic, setExamClinic] = useState('');
  const [examDate, setExamDate] = useState('');
  const { data: clinics } = useClinics();

  // Realtime subscriptions
  useRealtimeSubscription({
    channelName: `admission-detail-${id}`,
    enabled: !!id,
    tables: [
      { table: 'admission_requests', filter: `id=eq.${id}`, queryKeys: [['admission_request', id!], ['admission_requests'], ['adm_all']] },
      { table: 'candidates', filter: `admission_request_id=eq.${id}`, queryKeys: [['candidates', id!]] },
      { table: 'medical_exams', queryKeys: [['medical_exam']] },
      { table: 'candidate_documents', queryKeys: [['candidate_documents']] },
      { table: 'status_history', queryKeys: [['status_history']] },
      { table: 'notifications', queryKeys: [['notifications']] },
    ],
  });

  const handleStatusChange = async (toStatus: string, reason?: string) => {
    if (!id) return;
    await statusMutation.mutateAsync({ requestId: id, toStatus, reason });
  };

  const handleAddCandidate = async () => {
    if (!id || !candidateForm.nome) return;
    await createCandidate.mutateAsync({
      admission_request_id: id,
      nome: candidateForm.nome,
      cpf: candidateForm.cpf || null,
      telefone: candidateForm.telefone || null,
      email: candidateForm.email || null,
      cidade: candidateForm.cidade || null,
    });
    setShowAddCandidate(false);
    setCandidateForm({ nome: '', cpf: '', telefone: '', email: '', cidade: '' });
  };

  const handleGenerateToken = async (candidateId: string) => {
    const result = await generateToken.mutateAsync(candidateId);
    if (result?.token) {
      const link = `${window.location.origin}/public/candidate/${result.token}`;
      setTokenLink(link);
    }
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
        status_triagem: 'em_triagem' as any,
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

  const handleConfirmDocsWhatsApp = async () => {
    if (!id) return;
    setDocsConfirmed(true);
    await supabase.from('audit_logs').insert({
      user_id: user?.id,
      action: 'confirm_docs_whatsapp',
      entity_type: 'admission_requests',
      entity_id: id,
      details: { confirmed_at: new Date().toISOString() },
    });
    await handleStatusChange('registros_concluidos');
  };

  const copyLink = () => {
    if (tokenLink) {
      navigator.clipboard.writeText(tokenLink);
      toast({ title: 'Link copiado!' });
    }
  };

  // Derived state
  const activeCandidates = useMemo(() =>
    candidates?.filter((c: any) => c.status_triagem !== 'reprovado' && c.status_triagem !== 'desistente') || []
  , [candidates]);

  const approvedCandidates = useMemo(() =>
    candidates?.filter((c: any) => c.interview_approved === true) || []
  , [candidates]);

  // Check if all active candidates have interview result
  const allActiveHaveInterviewResult = useMemo(() => {
    if (!candidates || candidates.length === 0) return false;
    const active = candidates.filter((c: any) => c.status_triagem !== 'desistente');
    return active.length > 0 && active.every((c: any) => c.interview_approved === true || c.interview_approved === false);
  }, [candidates]);

  const hasApprovedCandidates = approvedCandidates.length > 0;

  // Check if a candidate's interview date/time has passed
  const isInterviewPast = (interviewAt: string | null): boolean => {
    if (!interviewAt) return false;
    return new Date(interviewAt) <= new Date();
  };

  // Check candidate interview status label
  const getInterviewStatusLabel = (c: any): { label: string; variant: string } => {
    if (!c.interview_at) return { label: 'Não agendada', variant: 'pending' };
    if (c.interview_approved === true) return { label: 'Aprovado', variant: 'approved' };
    if (c.interview_approved === false) return { label: 'Eliminado', variant: 'rejected' };
    if (!isInterviewPast(c.interview_at)) return { label: 'Aguardando data/hora', variant: 'info' };
    return { label: 'Liberado para decisão', variant: 'pending' };
  };

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

  const status = req.status;

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
            hasDocuments={status === 'registros_concluidos' || status === 'concluido'}
            hasExam={['exame_realizado', 'aguardando_registro', 'registros_concluidos', 'concluido'].includes(status)}
            hasRegistration={['registros_concluidos', 'concluido'].includes(status)}
          />
        </CardContent>
      </Card>

      {/* ETAPA 0: Enviar para triagem (requester draft) */}
      {req.requester_user_id === user?.id && status === 'rascunho' && (
        <Card>
          <CardContent className="p-4">
            <Button onClick={() => handleStatusChange('aguardando_triagem')} className="gap-2">
              <Send className="w-4 h-4" /> Enviar para Triagem
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ETAPA 1: Iniciar Triagem */}
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

      {/* ETAPA 2: Candidatos (em_triagem) */}
      {isRH && status === 'em_triagem' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Etapa 2 — Candidatos ({candidates?.length || 0})</h3>
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
                        <p className="text-xs text-muted-foreground">{c.telefone || c.email || '—'} {c.cidade && `· ${c.cidade}`}</p>
                      </div>
                      <StatusBadge status={c.status_triagem} label={CANDIDATE_STATUS_LABELS[c.status_triagem] || c.status_triagem} />
                    </div>
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

      {/* ETAPA 3: Entrevista (aguardando_documentos / documentos_em_analise) */}
      {isRH && (status === 'aguardando_documentos' || status === 'documentos_em_analise') && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Etapa 3 — Entrevista</h3>
            <p className="text-xs text-muted-foreground">
              Agende a entrevista para cada candidato. Após a data/hora da entrevista, decida: Continuar ou Eliminar.
            </p>

            {candidates?.map((c: any) => {
              if (c.status_triagem === 'reprovado' || c.status_triagem === 'desistente') return null;
              const interviewStatus = getInterviewStatusLabel(c);
              const canDecide = c.interview_at && isInterviewPast(c.interview_at) && c.interview_approved == null;

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
                      </div>
                    </div>
                  </div>

                  {/* Show interview details */}
                  {c.interview_at && (
                    <div className="bg-muted/50 rounded-lg p-2 text-xs text-muted-foreground space-y-0.5">
                      <p className="flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {new Date(c.interview_at).toLocaleString('pt-BR')}</p>
                      {c.interview_address && <p className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {c.interview_address}{c.interview_city ? `, ${c.interview_city}` : ''}</p>}
                      {c.interviewer_name && <p className="flex items-center gap-1"><User className="w-3 h-3" /> {c.interviewer_name}</p>}
                      {!isInterviewPast(c.interview_at) && c.interview_approved == null && (
                        <p className="flex items-center gap-1 text-[hsl(var(--status-info-foreground))] font-medium mt-1">
                          <Clock className="w-3 h-3" /> Entrevista ainda não ocorreu. Aguarde a data/hora.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-1 flex-wrap">
                    {/* Schedule / Reschedule */}
                    {(!c.interview_at || (c.interview_approved == null && !isInterviewPast(c.interview_at))) && (
                      <Button variant="ghost" size="sm" onClick={() => setInterviewCandidate(c)} className="gap-1 text-xs">
                        <CalendarClock className="w-3 h-3" /> {c.interview_at ? 'Reagendar' : 'Agendar Entrevista'}
                      </Button>
                    )}

                    {/* Decision buttons: only if interview date passed and no decision yet */}
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

            {/* Advance button */}
            {status === 'aguardando_documentos' && allActiveHaveInterviewResult && hasApprovedCandidates && (
              <Button onClick={() => handleStatusChange('documentos_em_analise')} className="gap-2 w-full" size="sm">
                <CheckCircle className="w-4 h-4" /> Avançar candidatos aprovados
              </Button>
            )}

            {status === 'aguardando_documentos' && allActiveHaveInterviewResult && !hasApprovedCandidates && (
              <div className="text-center py-3">
                <p className="text-xs text-destructive flex items-center justify-center gap-1 mb-2">
                  <AlertTriangle className="w-3 h-3" /> Nenhum candidato aprovado. Não é possível avançar.
                </p>
                <Button onClick={() => handleStatusChange('cancelado')} variant="destructive" size="sm" className="gap-2">
                  <XCircle className="w-4 h-4" /> Encerrar processo
                </Button>
              </div>
            )}

            {status === 'aguardando_documentos' && !allActiveHaveInterviewResult && (
              <p className="text-xs text-muted-foreground text-center py-2">
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                Registre o resultado (Continuar/Eliminar) para todos os candidatos após a data da entrevista para avançar.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ETAPA 4: Exame (documentos_em_analise / aguardando_exame / exame_realizado) */}
      {isRH && (status === 'documentos_em_analise' || status === 'aguardando_exame' || status === 'exame_realizado') && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Stethoscope className="w-4 h-4" /> Etapa 4 — Exame Admissional</h3>
            <p className="text-xs text-muted-foreground">
              Agende o exame para cada candidato aprovado. O resultado só pode ser registrado após a data/hora do exame.
            </p>

            {approvedCandidates.map((c: any) => (
              <ExamSection key={c.id} candidateId={c.id} candidateName={c.nome} clinics={clinics} onAdvance={() => {}} />
            ))}

            {status === 'documentos_em_analise' && (
              <Button onClick={() => handleStatusChange('aguardando_exame')} className="gap-2 w-full" size="sm">
                <CheckCircle className="w-4 h-4" /> Confirmar agendamento de exames
              </Button>
            )}

            {status === 'exame_realizado' && (
              <Button onClick={() => handleStatusChange('aguardando_registro')} className="gap-2 w-full" size="sm">
                <CheckCircle className="w-4 h-4" /> Prosseguir para Confirmação de Docs
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ETAPA 5: Confirmação Docs WhatsApp (aguardando_registro) */}
      {isRH && status === 'aguardando_registro' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MessageCircle className="w-4 h-4" /> Etapa 5 — Confirmação de Documentos (WhatsApp)
            </h3>
            <p className="text-xs text-muted-foreground">
              Confirme que recebeu os documentos pessoais do(s) candidato(s) aprovado(s) via WhatsApp.
            </p>
            <div className="flex items-center gap-3">
              <Checkbox
                id="docs-whatsapp"
                checked={docsConfirmed}
                onCheckedChange={(checked) => setDocsConfirmed(!!checked)}
              />
              <Label htmlFor="docs-whatsapp" className="text-sm">
                Confirmar recebimento dos documentos (WhatsApp)
              </Label>
            </div>
            <Button
              onClick={handleConfirmDocsWhatsApp}
              disabled={!docsConfirmed || statusMutation.isPending}
              className="gap-2 w-full"
              size="sm"
            >
              {statusMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <CheckCircle className="w-4 h-4" /> Confirmar e Avançar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ETAPA 6: Assinatura Link Externo (registros_concluidos) */}
      {isRH && status === 'registros_concluidos' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Link2 className="w-4 h-4" /> Etapa 6 — Assinatura (Link Externo)
            </h3>
            <p className="text-xs text-muted-foreground">
              Gere um link seguro para cada candidato aprovado. O candidato pode baixar documentos e reenviar assinados. Válido por 7 dias.
            </p>
            {approvedCandidates.map((c: any) => (
              <div key={c.id} className="border border-border rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm font-medium">{c.nome}</span>
                <Button variant="outline" size="sm" onClick={() => handleGenerateToken(c.id)} className="gap-1 text-xs">
                  <Link2 className="w-3 h-3" /> Gerar Link
                </Button>
              </div>
            ))}

            <Button onClick={() => handleStatusChange('concluido')} className="gap-2 w-full" size="sm">
              <CheckCircle className="w-4 h-4" /> Concluir Admissão
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ETAPA 7: Concluído */}
      {status === 'concluido' && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-8 h-8 mx-auto text-primary mb-2" />
            <p className="text-sm font-semibold text-foreground">Admissão Concluída</p>
            <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
              <p>Cargo: {req.cargo_funcao}</p>
              <p>Local: {req.local_contratacao}</p>
              {req.data_prevista_inicio && <p>Início previsto: {new Date(req.data_prevista_inicio).toLocaleDateString('pt-BR')}</p>}
              {approvedCandidates.length > 0 && (
                <p>Contratado(s): {approvedCandidates.map((c: any) => c.nome).join(', ')}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Token Link dialog */}
      {tokenLink && (
        <Dialog open={!!tokenLink} onOpenChange={() => setTokenLink(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Link para Candidato</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Envie este link ao candidato para assinatura de documentos. Válido por 7 dias.</p>
            <div className="flex gap-2">
              <Input value={tokenLink} readOnly className="text-xs" />
              <Button onClick={copyLink} size="sm" className="gap-1"><Copy className="w-3 h-3" /> Copiar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add candidate dialog */}
      <Dialog open={showAddCandidate} onOpenChange={setShowAddCandidate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Candidato</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nome *</Label><Input value={candidateForm.nome} onChange={e => setCandidateForm(p => ({ ...p, nome: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>CPF</Label><Input value={candidateForm.cpf} onChange={e => setCandidateForm(p => ({ ...p, cpf: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Telefone</Label><Input value={candidateForm.telefone} onChange={e => setCandidateForm(p => ({ ...p, telefone: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={candidateForm.email} onChange={e => setCandidateForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Cidade</Label><Input value={candidateForm.cidade} onChange={e => setCandidateForm(p => ({ ...p, cidade: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCandidate(false)}>Cancelar</Button>
            <Button onClick={handleAddCandidate} disabled={!candidateForm.nome}>Salvar</Button>
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

// Inline ExamSection component for each candidate
function ExamSection({ candidateId, candidateName, clinics, onAdvance }: { candidateId: string; candidateName: string; clinics: any; onAdvance: () => void }) {
  const { data: exam } = useMedicalExam(candidateId);
  const { toast } = useToast();
  const [examClinic, setExamClinic] = useState('');
  const [examDate, setExamDate] = useState('');

  const handleCreateExam = async () => {
    const { error } = await supabase.from('medical_exams').insert({
      candidate_id: candidateId,
      clinic_id: examClinic || null,
      scheduled_at: examDate || null,
    });
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else toast({ title: 'Exame agendado' });
  };

  const handleExamResult = async (status: string) => {
    if (!exam) return;
    const { error } = await supabase.from('medical_exams').update({ status: status as any }).eq('id', exam.id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else toast({ title: 'Resultado registrado' });
  };

  useRealtimeSubscription({
    channelName: `exam-${candidateId}`,
    enabled: !!candidateId,
    tables: [
      { table: 'medical_exams', filter: `candidate_id=eq.${candidateId}`, queryKeys: [['medical_exam', candidateId]] },
    ],
  });

  const isExamPast = exam?.scheduled_at && new Date(exam.scheduled_at) <= new Date();

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <p className="text-sm font-medium">{candidateName}</p>
      {exam ? (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            <p>Clínica: {(exam as any).clinics?.nome || '—'}</p>
            <p>Data: {exam.scheduled_at ? new Date(exam.scheduled_at).toLocaleString('pt-BR') : '—'}</p>
            <StatusBadge status={exam.status} label={EXAM_STATUS_LABELS[exam.status] || exam.status} />
            {exam.status === 'aguardando' && !isExamPast && (
              <p className="flex items-center gap-1 mt-1 text-xs text-[hsl(var(--status-info-foreground))]">
                <Clock className="w-3 h-3" /> Aguardando data/hora do exame
              </p>
            )}
          </div>
          {exam.status === 'aguardando' && isExamPast && (
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={() => handleExamResult('apto')} className="gap-1"><CheckCircle className="w-3 h-3" /> Apto</Button>
              <Button size="sm" variant="outline" onClick={() => handleExamResult('apto_com_restricao')}>Apto c/ Restrição</Button>
              <Button size="sm" variant="destructive" onClick={() => handleExamResult('inapto')}>Inapto</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Clínica</Label>
              <Select value={examClinic} onValueChange={setExamClinic}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {clinics?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data/Hora</Label>
              <Input type="datetime-local" value={examDate} onChange={e => setExamDate(e.target.value)} />
            </div>
          </div>
          <Button size="sm" onClick={handleCreateExam}>Agendar Exame</Button>
        </div>
      )}
    </div>
  );
}
