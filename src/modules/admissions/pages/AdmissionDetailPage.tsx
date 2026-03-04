import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmissionRequest, useCandidates, useCreateCandidate, useAdmissionSetStatus, useGenerateToken, useUpdateCandidate } from '../hooks/useAdmissionQueries';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusTimeline } from '@/components/StatusTimeline';
import { AdmissionStepper } from '../components/AdmissionStepper';
import { InterviewDialog } from '../components/InterviewDialog';
import { ADMISSION_STATUS_LABELS, CANDIDATE_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import { ArrowLeft, Loader2, UserPlus, Send, Link2, Copy, CheckCircle, XCircle, Clock, Building2, DollarSign, Calendar, User, CalendarClock, MapPin, AlertTriangle, Briefcase } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

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
  const isDiretoria = hasAnyRole(['diretoria']);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateForm, setCandidateForm] = useState({ nome: '', cpf: '', telefone: '', email: '', cidade: '' });
  const [tokenLink, setTokenLink] = useState<string | null>(null);
  const [interviewCandidate, setInterviewCandidate] = useState<any | null>(null);

  // Realtime subscriptions
  useRealtimeSubscription({
    channelName: `admission-detail-${id}`,
    enabled: !!id,
    tables: [
      { table: 'admission_requests', filter: `id=eq.${id}`, queryKeys: [['admission_request', id!], ['admission_requests'], ['adm_all']] },
      { table: 'candidates', filter: `admission_request_id=eq.${id}`, queryKeys: [['candidates', id!]] },
      { table: 'status_history', queryKeys: [['status_history']] },
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
    toast({ title: approved ? 'Candidato aprovado!' : 'Candidato reprovado' });
  };

  const copyLink = () => {
    if (tokenLink) {
      navigator.clipboard.writeText(tokenLink);
      toast({ title: 'Link copiado!' });
    }
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

  const hasInterviewed = candidates?.some((c: any) => c.interview_at) ?? false;
  const hasSubmittedDocs = candidates?.some((c: any) => c.status_triagem === 'aprovado') ?? false;

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
            <span className="flex items-center gap-1.5 text-muted-foreground"><Building2 className="w-3.5 h-3.5" />{req.centro_custo || '—'}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground"><DollarSign className="w-3.5 h-3.5" />R$ {req.salario_previsto ? Number(req.salario_previsto).toLocaleString('pt-BR') : '—'}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="w-3.5 h-3.5" />{req.data_prevista_inicio ? new Date(req.data_prevista_inicio).toLocaleDateString('pt-BR') : '—'}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground"><User className="w-3.5 h-3.5" />{(req as any).profiles?.full_name || '—'}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground"><Briefcase className="w-3.5 h-3.5" />{req.tipo_contrato || '—'}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="w-3.5 h-3.5" />{req.local_contratacao || '—'}</span>
          </div>
          {req.motivo && <p className="text-sm text-muted-foreground border-t border-border pt-2">{req.motivo}</p>}
        </CardContent>
      </Card>

      {/* Stepper / Flow */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Fluxo do Processo</h3>
          <AdmissionStepper
            status={req.status}
            candidateCount={candidates?.length || 0}
            hasInterview={hasInterviewed}
            hasDocuments={hasSubmittedDocs}
            hasExam={['exame_realizado', 'aguardando_registro', 'registros_concluidos', 'concluido'].includes(req.status)}
            hasRegistration={['registros_concluidos', 'concluido'].includes(req.status)}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      {isRH && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Ações RH</h3>
            <div className="flex flex-wrap gap-2">
              {req.status === 'aguardando_triagem' && (
                <Button onClick={() => handleStatusChange('em_triagem')} className="gap-2" size="sm">
                  <Clock className="w-4 h-4" /> Iniciar Triagem
                </Button>
              )}
              {req.status === 'em_triagem' && (
                <>
                  <Button onClick={() => handleStatusChange('aguardando_documentos')} className="gap-2" size="sm">
                    <CheckCircle className="w-4 h-4" /> Solicitar Documentos
                  </Button>
                  <Button onClick={() => handleStatusChange('cancelado')} variant="destructive" size="sm" className="gap-2">
                    <XCircle className="w-4 h-4" /> Cancelar
                  </Button>
                </>
              )}
              {req.status === 'documentos_em_analise' && (
                <>
                  <Button onClick={() => handleStatusChange('aguardando_exame')} className="gap-2" size="sm">
                    <CheckCircle className="w-4 h-4" /> Aprovar Docs → Exame
                  </Button>
                  <Button onClick={() => handleStatusChange('aguardando_documentos')} variant="outline" size="sm" className="gap-2">
                    Devolver Docs
                  </Button>
                </>
              )}
              {req.status === 'exame_realizado' && (
                <Button onClick={() => handleStatusChange('aguardando_registro')} className="gap-2" size="sm">
                  <CheckCircle className="w-4 h-4" /> Prosseguir Registro
                </Button>
              )}
              {req.status === 'aguardando_registro' && (
                <Button onClick={() => handleStatusChange('registros_concluidos')} className="gap-2" size="sm">
                  <CheckCircle className="w-4 h-4" /> Registros OK
                </Button>
              )}
              {req.status === 'registros_concluidos' && (
                <Button onClick={() => handleStatusChange('concluido')} className="gap-2" size="sm">
                  <CheckCircle className="w-4 h-4" /> Confirmar Admissão
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Requester: submit draft */}
      {req.requester_user_id === user?.id && req.status === 'rascunho' && (
        <Card>
          <CardContent className="p-4">
            <Button onClick={() => handleStatusChange('aguardando_triagem')} className="gap-2">
              <Send className="w-4 h-4" /> Enviar para Triagem
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Candidates */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Candidatos ({candidates?.length || 0})</h3>
            {isRH && ['em_triagem', 'aguardando_documentos'].includes(req.status) && (
              <Button variant="outline" size="sm" onClick={() => setShowAddCandidate(true)} className="gap-1">
                <UserPlus className="w-3 h-3" /> Adicionar
              </Button>
            )}
          </div>

          {!candidates || candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum candidato cadastrado</p>
          ) : (
            <div className="space-y-2">
              {candidates.map((c: any) => (
                <div key={c.id} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">{c.email || c.telefone || '—'} {c.cidade && `· ${c.cidade}`}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusBadge status={c.status_triagem} label={CANDIDATE_STATUS_LABELS[c.status_triagem] || c.status_triagem} />
                        {c.interview_at && !c.interview_approved && c.interview_approved !== false && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium status-pending">
                            <AlertTriangle className="w-3 h-3" /> Aguardando confirmação
                          </span>
                        )}
                        {c.interview_approved === true && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium status-approved">
                            <CheckCircle className="w-3 h-3" /> Entrevista aprovada
                          </span>
                        )}
                        {c.interview_approved === false && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium status-rejected">
                            <XCircle className="w-3 h-3" /> Entrevista reprovada
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Interview info */}
                  {c.interview_at && (
                    <div className="bg-muted/50 rounded-lg p-2 text-xs text-muted-foreground space-y-0.5">
                      <p className="flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Entrevista: {new Date(c.interview_at).toLocaleString('pt-BR')}</p>
                      {c.interview_address && <p className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {c.interview_address}{c.interview_city ? `, ${c.interview_city}` : ''}</p>}
                      {c.interviewer_name && <p className="flex items-center gap-1"><User className="w-3 h-3" /> Entrevistador: {c.interviewer_name}</p>}
                    </div>
                  )}

                  {/* Candidate actions */}
                  <div className="flex gap-1 flex-wrap">
                    {isRH && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/admissions/candidate/${c.id}`)} className="text-xs">Detalhes</Button>
                        <Button variant="ghost" size="sm" onClick={() => handleGenerateToken(c.id)} className="gap-1 text-xs">
                          <Link2 className="w-3 h-3" /> Link
                        </Button>
                        {!c.interview_at && c.status_triagem !== 'reprovado' && (
                          <Button variant="ghost" size="sm" onClick={() => setInterviewCandidate(c)} className="gap-1 text-xs">
                            <CalendarClock className="w-3 h-3" /> Entrevista
                          </Button>
                        )}
                        {c.interview_at && c.interview_approved == null && isDiretoria && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleInterviewResult(c.id, true)} className="text-xs text-primary gap-1">
                              <CheckCircle className="w-3 h-3" /> Aprovar
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleInterviewResult(c.id, false)} className="text-xs text-destructive gap-1">
                              <XCircle className="w-3 h-3" /> Reprovar
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Token Link dialog */}
      {tokenLink && (
        <Dialog open={!!tokenLink} onOpenChange={() => setTokenLink(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Link para Candidato</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Envie este link ao candidato para que ele envie os documentos. Válido por 7 dias.</p>
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
              <div className="space-y-1.5"><Label>Telefone *</Label><Input value={candidateForm.telefone} onChange={e => setCandidateForm(p => ({ ...p, telefone: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={candidateForm.email} onChange={e => setCandidateForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Cidade *</Label><Input value={candidateForm.cidade} onChange={e => setCandidateForm(p => ({ ...p, cidade: e.target.value }))} /></div>
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

      {/* Admission confirmation card */}
      {req.status === 'concluido' && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-8 h-8 mx-auto text-primary mb-2" />
            <p className="text-sm font-semibold text-foreground">Admissão Concluída</p>
            <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
              <p>Cargo: {req.cargo_funcao}</p>
              <p>Local: {req.local_contratacao}</p>
              {req.data_prevista_inicio && <p>Início previsto: {new Date(req.data_prevista_inicio).toLocaleDateString('pt-BR')}</p>}
            </div>
          </CardContent>
        </Card>
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
