import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmissionRequest, useCandidates, useCreateCandidate, useAdmissionSetStatus, useGenerateToken } from '../hooks/useAdmissionQueries';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusTimeline } from '@/components/StatusTimeline';
import { ADMISSION_STATUS_LABELS, CANDIDATE_STATUS_LABELS } from '@/lib/constants';
import { ArrowLeft, Loader2, UserPlus, Send, Link2, Copy, CheckCircle, XCircle, Clock, Building2, DollarSign, Calendar, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function AdmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasAnyRole, hasRole } = useAuth();
  const { toast } = useToast();
  const { data: req, isLoading, refetch } = useAdmissionRequest(id!);
  const { data: candidates, refetch: refetchCandidates } = useCandidates(id!);
  const createCandidate = useCreateCandidate();
  const statusMutation = useAdmissionSetStatus();
  const generateToken = useGenerateToken();

  const isRH = hasAnyRole(['diretoria', 'rh', 'administrativo']);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateForm, setCandidateForm] = useState({ nome: '', cpf: '', telefone: '', email: '', cidade: '' });
  const [tokenLink, setTokenLink] = useState<string | null>(null);

  // Realtime
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`admission-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admission_requests', filter: `id=eq.${id}` }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates', filter: `admission_request_id=eq.${id}` }, () => refetchCandidates())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  const handleStatusChange = async (toStatus: string, reason?: string) => {
    if (!id) return;
    await statusMutation.mutateAsync({ requestId: id, toStatus, reason });
    refetch();
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
    refetchCandidates();
  };

  const handleGenerateToken = async (candidateId: string) => {
    const result = await generateToken.mutateAsync(candidateId);
    if (result?.token) {
      const link = `${window.location.origin}/public/candidate/${result.token}`;
      setTokenLink(link);
    }
  };

  const copyLink = () => {
    if (tokenLink) {
      navigator.clipboard.writeText(tokenLink);
      toast({ title: 'Link copiado!' });
    }
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
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
            <StatusBadge status={req.status} label={ADMISSION_STATUS_LABELS[req.status] || req.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground"><Building2 className="w-3.5 h-3.5" />{req.centro_custo || '—'}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground"><DollarSign className="w-3.5 h-3.5" />R$ {req.salario_previsto ? Number(req.salario_previsto).toLocaleString('pt-BR') : '—'}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="w-3.5 h-3.5" />{req.data_prevista_inicio ? new Date(req.data_prevista_inicio).toLocaleDateString('pt-BR') : '—'}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground"><User className="w-3.5 h-3.5" />{(req as any).profiles?.full_name || '—'}</span>
          </div>
          {req.motivo && <p className="text-sm text-muted-foreground border-t border-border pt-2">{req.motivo}</p>}
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
                  <CheckCircle className="w-4 h-4" /> Concluir Admissão
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
                <div key={c.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">{c.email || c.telefone || '—'}</p>
                    <StatusBadge status={c.status_triagem} label={CANDIDATE_STATUS_LABELS[c.status_triagem] || c.status_triagem} className="mt-1" />
                  </div>
                  <div className="flex gap-1">
                    {isRH && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/admissions/candidate/${c.id}`)} className="text-xs">Detalhes</Button>
                        <Button variant="ghost" size="sm" onClick={() => handleGenerateToken(c.id)} className="gap-1 text-xs">
                          <Link2 className="w-3 h-3" /> Link
                        </Button>
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
