import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmissionRequest, useCandidates, useCreateCandidate, useAdmissionSetStatus, useGenerateToken, useUpdateCandidate, useMedicalExam } from '../hooks/useAdmissionQueries';
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
import { ADMISSION_STATUS_LABELS, CANDIDATE_STATUS_LABELS, PRIORITY_LABELS, EXAM_STATUS_LABELS } from '@/lib/constants';
import { ArrowLeft, Loader2, UserPlus, Send, Link2, Copy, CheckCircle, XCircle, Clock, DollarSign, Calendar, User, CalendarClock, MapPin, AlertTriangle, Briefcase, Stethoscope, Ban, FileText, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

export default function AdmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: req, isLoading } = useAdmissionRequest(id!);
  const { data: candidates } = useCandidates(id!);
  const createCandidate = useCreateCandidate();
  const updateCandidate = useUpdateCandidate();
  const statusMutation = useAdmissionSetStatus();
  const generateToken = useGenerateToken();

  const isRH = hasAnyRole(['diretoria', 'rh', 'administrativo']);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateForm, setCandidateForm] = useState({ nome: '', cpf: '', telefone: '', email: '', cidade: '' });
  const [interviewCandidate, setInterviewCandidate] = useState<any | null>(null);

  // Document links state
  const [docLinks, setDocLinks] = useState<Record<string, string>>({});
  const docLinksGenRef = useRef(false);

  // Signature links state
  const [sigLinks, setSigLinks] = useState<Record<string, string>>({});
  const sigLinksGenRef = useRef(false);

  // Docs confirmed state
  const [docsConfirmed, setDocsConfirmed] = useState(false);

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

  // FIX: Do NOT update status_triagem when scheduling interview (avoids trigger error)
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
    if (!interviewAt) return false;
    return new Date(interviewAt) <= new Date();
  };

  const getInterviewStatusLabel = (c: any): { label: string; variant: string } => {
    if (!c.interview_at) return { label: 'Não agendada', variant: 'pending' };
    if (c.interview_approved === true) return { label: 'Aprovado', variant: 'approved' };
    if (c.interview_approved === false) return { label: 'Eliminado', variant: 'rejected' };
    if (!isInterviewPast(c.interview_at)) return { label: 'Aguardando data/hora', variant: 'info' };
    return { label: 'Liberado para decisão', variant: 'pending' };
  };

  // Auto-generate document links when entering documentos_em_analise step
  useEffect(() => {
    if (req?.status === 'documentos_em_analise' && approvedCandidates.length > 0 && !docLinksGenRef.current) {
      docLinksGenRef.current = true;
      (async () => {
        const links: Record<string, string> = {};
        for (const c of approvedCandidates) {
          try {
            const result = await generateToken.mutateAsync(c.id);
            if (result?.token) {
              links[c.id] = `${window.location.origin}/envio-documentos?token=${result.token}`;
            }
          } catch (e) { console.error('Token gen error:', e); }
        }
        setDocLinks(links);
      })();
    }
  }, [req?.status, approvedCandidates.length]);

  // Auto-generate signature links when entering aguardando_registro step
  useEffect(() => {
    if (req?.status === 'aguardando_registro' && approvedCandidates.length > 0 && !sigLinksGenRef.current) {
      sigLinksGenRef.current = true;
      (async () => {
        const links: Record<string, string> = {};
        for (const c of approvedCandidates) {
          try {
            const result = await generateToken.mutateAsync(c.id);
            if (result?.token) {
              links[c.id] = `${window.location.origin}/assinatura-documentos?token=${result.token}`;
            }
          } catch (e) { console.error('Token gen error:', e); }
        }
        setSigLinks(links);
      })();
    }
  }, [req?.status, approvedCandidates.length]);

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
            hasDocuments={['aguardando_exame', 'exame_realizado', 'aguardando_registro', 'registros_concluidos', 'concluido'].includes(status)}
            hasExam={['aguardando_registro', 'registros_concluidos', 'concluido'].includes(status)}
            hasRegistration={['concluido'].includes(status)}
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

      {/* ===== ETAPA 2: Entrevista (aguardando_documentos) ===== */}
      {isRH && status === 'aguardando_documentos' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Etapa 2 — Entrevista</h3>
            <p className="text-xs text-muted-foreground">
              Agende a entrevista para cada candidato. Após a data/hora, decida: Continuar ou Eliminar.
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
                    {(!c.interview_at || (c.interview_approved == null && !isInterviewPast(c.interview_at))) && (
                      <Button variant="ghost" size="sm" onClick={() => setInterviewCandidate(c)} className="gap-1 text-xs">
                        <CalendarClock className="w-3 h-3" /> {c.interview_at ? 'Reagendar' : 'Agendar Entrevista'}
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
              Links gerados automaticamente para cada candidato aprovado. O candidato pode enviar documentos pessoais, dados bancários e certidões.
            </p>

            {approvedCandidates.map((c: any) => {
              const link = docLinks[c.id];
              return (
                <div key={c.id} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{c.nome}</p>
                  </div>
                  {link ? (
                    <div className="flex gap-2 items-center">
                      <Input value={link} readOnly className="text-xs flex-1" />
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(link)} className="gap-1 text-xs shrink-0">
                        <Copy className="w-3 h-3" /> Copiar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">Gerando link...</span>
                    </div>
                  )}
                </div>
              );
            })}

            {Object.keys(docLinks).length > 0 && (
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

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                docLinksGenRef.current = false;
                setDocLinks({});
                // Trigger regeneration
                setTimeout(() => {
                  docLinksGenRef.current = false;
                  window.location.reload();
                }, 100);
              }}
              className="text-xs gap-1"
            >
              <Link2 className="w-3 h-3" /> Regenerar links
            </Button>
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
              Digite o nome da clínica, data e hora. Após a data/hora, registre o resultado.
            </p>

            {approvedCandidates.map((c: any) => (
              <ExamSection key={c.id} candidateId={c.id} candidateName={c.nome} />
            ))}

            {status === 'exame_realizado' && (
              <Button onClick={() => handleStatusChange('aguardando_registro')} className="gap-2 w-full" size="sm">
                <CheckCircle className="w-4 h-4" /> Avançar para Assinatura
              </Button>
            )}
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

            {approvedCandidates.map((c: any) => (
              <SignatureSection
                key={c.id}
                candidateId={c.id}
                candidateName={c.nome}
                link={sigLinks[c.id]}
                onCopyLink={() => sigLinks[c.id] && copyToClipboard(sigLinks[c.id])}
              />
            ))}

            <Button onClick={() => handleStatusChange('concluido')} className="gap-2 w-full" size="sm">
              <CheckCircle className="w-4 h-4" /> Concluir Admissão
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ===== ETAPA 6: Concluído ===== */}
      {(status === 'concluido' || status === 'registros_concluidos') && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-8 h-8 mx-auto text-primary mb-2" />
            <p className="text-sm font-semibold text-foreground">Admissão Concluída — Admitido</p>
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

// ===== ExamSection: Free-text clinic + date/time + result =====
function ExamSection({ candidateId, candidateName }: { candidateId: string; candidateName: string }) {
  const { data: exam } = useMedicalExam(candidateId);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [clinicName, setClinicName] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examTime, setExamTime] = useState('');
  const [examNotes, setExamNotes] = useState('');

  useRealtimeSubscription({
    channelName: `exam-${candidateId}`,
    enabled: !!candidateId,
    tables: [
      { table: 'medical_exams', filter: `candidate_id=eq.${candidateId}`, queryKeys: [['medical_exam', candidateId]] },
    ],
  });

  const handleCreateExam = async () => {
    if (!clinicName || !examDate || !examTime) {
      toast({ title: 'Preencha clínica, data e hora', variant: 'destructive' });
      return;
    }
    const scheduledAt = `${examDate}T${examTime}:00`;
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
    }
  };

  const isExamPast = exam?.scheduled_at && new Date(exam.scheduled_at) <= new Date();

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <p className="text-sm font-medium">{candidateName}</p>
      {exam ? (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>Clínica: {(exam as any).clinic_name || (exam as any).clinics?.nome || '—'}</p>
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
          <div className="space-y-1.5">
            <Label className="text-xs">Nome da clínica *</Label>
            <Input value={clinicName} onChange={e => setClinicName(e.target.value)} placeholder="Ex: Clínica São Lucas" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Data *</Label>
              <Input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
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
          <Button size="sm" onClick={handleCreateExam} disabled={!clinicName || !examDate || !examTime}>
            <Stethoscope className="w-3 h-3 mr-1" /> Agendar Exame
          </Button>
        </div>
      )}
    </div>
  );
}

// ===== SignatureSection: Admin upload + candidate link =====
function SignatureSection({ candidateId, candidateName, link, onCopyLink }: {
  candidateId: string;
  candidateName: string;
  link?: string;
  onCopyLink: () => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [adminFiles, setAdminFiles] = useState<string[]>([]);

  // Load admin-uploaded files
  useEffect(() => {
    loadAdminFiles();
  }, [candidateId]);

  const loadAdminFiles = async () => {
    const { data } = await supabase.storage.from('admissions').list(`candidates/${candidateId}/signature-outgoing`);
    setAdminFiles((data || []).filter(f => f.name !== '.emptyFolderPlaceholder').map(f => f.name));
  };

  const handleAdminUpload = async (file: File) => {
    setUploading(true);
    const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `candidates/${candidateId}/signature-outgoing/${Date.now()}_${sanitized}`;
    const { error } = await supabase.storage.from('admissions').upload(path, file);
    if (error) {
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Documento enviado para assinatura!' });
      loadAdminFiles();
    }
    setUploading(false);
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <p className="text-sm font-medium">{candidateName}</p>

      {/* Admin upload section */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Documentos internos (para o candidato assinar)</Label>
        {adminFiles.length > 0 && (
          <div className="space-y-1">
            {adminFiles.map(f => (
              <p key={f} className="text-xs text-muted-foreground flex items-center gap-1">
                <FileText className="w-3 h-3" /> {f}
              </p>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            disabled={uploading}
            onChange={e => { if (e.target.files?.[0]) handleAdminUpload(e.target.files[0]); }}
            className="text-xs"
          />
          {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
        </div>
      </div>

      {/* Link for candidate */}
      {link ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Link para o candidato</Label>
          <div className="flex gap-2 items-center">
            <Input value={link} readOnly className="text-xs flex-1" />
            <Button variant="outline" size="sm" onClick={onCopyLink} className="gap-1 text-xs shrink-0">
              <Copy className="w-3 h-3" /> Copiar
            </Button>
          </div>
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
