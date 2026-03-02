import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCandidate, useCandidateDocuments, useDocuments, useMedicalExam, useSystemRegistration, useClinics } from '../hooks/useAdmissionQueries';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/StatusBadge';
import { DOC_STATUS_LABELS, EXAM_STATUS_LABELS, CANDIDATE_STATUS_LABELS } from '@/lib/constants';
import { ArrowLeft, Loader2, CheckCircle, XCircle, FileText, Stethoscope, ClipboardList, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export default function CandidateDetailPage() {
  const { candidateId } = useParams<{ candidateId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: candidate, isLoading } = useCandidate(candidateId!);
  const { data: candidateDocs, refetch: refetchDocs } = useCandidateDocuments(candidateId!);
  const { data: allDocs } = useDocuments();
  const { data: exam, refetch: refetchExam } = useMedicalExam(candidateId!);
  const { data: registration, refetch: refetchReg } = useSystemRegistration(candidateId!);
  const { data: clinics } = useClinics();
  const [examClinic, setExamClinic] = useState('');
  const [examDate, setExamDate] = useState('');

  // Initialize candidate_documents if not yet created
  useEffect(() => {
    if (!candidateId || !allDocs || !candidateDocs) return;
    if (candidateDocs.length === 0 && allDocs.length > 0) {
      const inserts = allDocs.map((d: any) => ({
        candidate_id: candidateId,
        document_id: d.id,
        status: 'pending' as any,
      }));
      supabase.from('candidate_documents').insert(inserts).then(() => refetchDocs());
    }
  }, [candidateId, allDocs, candidateDocs]);

  const handleDocReview = async (cdId: string, decision: 'approved' | 'rejected') => {
    const { error } = await supabase.from('candidate_documents').update({
      status: decision as any,
      last_review_at: new Date().toISOString(),
    }).eq('id', cdId);
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }

    await supabase.from('document_reviews').insert({
      candidate_document_id: cdId,
      reviewer_user_id: (await supabase.auth.getUser()).data.user!.id,
      decision: decision as any,
    });
    refetchDocs();
    toast({ title: decision === 'approved' ? 'Documento aprovado' : 'Documento rejeitado' });
  };

  const handleCreateExam = async (clinicId: string, scheduledAt: string) => {
    if (!candidateId) return;
    const { error } = await supabase.from('medical_exams').insert({
      candidate_id: candidateId,
      clinic_id: clinicId || null,
      scheduled_at: scheduledAt || null,
    });
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Exame agendado' }); refetchExam(); }
  };

  const handleExamResult = async (status: string) => {
    if (!exam) return;
    const { error } = await supabase.from('medical_exams').update({ status: status as any }).eq('id', exam.id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Resultado registrado' }); refetchExam(); }
  };

  const handleRegistration = async (field: string, value: boolean) => {
    if (!candidateId) return;
    if (!registration) {
      await supabase.from('system_registrations').insert({ candidate_id: candidateId, [field]: value });
    } else {
      await supabase.from('system_registrations').update({ [field]: value }).eq('id', registration.id);
    }
    refetchReg();
  };

  const getSignedUrl = async (path: string) => {
    const { data } = await supabase.storage.from('admissions').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!candidate) return <p className="text-center py-12 text-muted-foreground">Candidato não encontrado</p>;

  // hooks moved to top

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
      <Button variant="ghost" className="gap-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

      {/* Candidate Info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2"><User className="w-5 h-5" /> {candidate.nome}</CardTitle>
            <StatusBadge status={candidate.status_triagem} label={CANDIDATE_STATUS_LABELS[candidate.status_triagem] || candidate.status_triagem} />
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          {candidate.email && <p>Email: {candidate.email}</p>}
          {candidate.telefone && <p>Telefone: {candidate.telefone}</p>}
          {candidate.cpf && <p>CPF: {candidate.cpf}</p>}
          {candidate.cidade && <p>Cidade: {candidate.cidade}</p>}
        </CardContent>
      </Card>

      {/* Documents Checklist */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><FileText className="w-4 h-4" /> Documentos</h3>
          {!candidateDocs || candidateDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando documentos...</p>
          ) : (
            <div className="space-y-2">
              {candidateDocs.map((cd: any) => (
                <div key={cd.id} className="flex items-center justify-between border border-border rounded-lg p-2.5 gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{cd.documents?.label || 'Documento'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StatusBadge status={cd.status} label={DOC_STATUS_LABELS[cd.status] || cd.status} />
                      {cd.documents?.required && <span className="text-[10px] text-destructive">Obrigatório</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {cd.file_path && <Button variant="ghost" size="sm" onClick={() => getSignedUrl(cd.file_path)} className="text-xs">Ver</Button>}
                    {cd.status === 'submitted' && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => handleDocReview(cd.id, 'approved')} className="text-xs text-primary">
                          <CheckCircle className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDocReview(cd.id, 'rejected')} className="text-xs text-destructive">
                          <XCircle className="w-3.5 h-3.5" />
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

      {/* Medical Exam */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Stethoscope className="w-4 h-4" /> Exame Médico</h3>
          {exam ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                <p>Clínica: {(exam as any).clinics?.nome || '—'}</p>
                <p>Data: {exam.scheduled_at ? new Date(exam.scheduled_at).toLocaleString('pt-BR') : '—'}</p>
                <StatusBadge status={exam.status} label={EXAM_STATUS_LABELS[exam.status] || exam.status} />
              </div>
              {exam.status === 'aguardando' && (
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={() => handleExamResult('apto')} className="gap-1"><CheckCircle className="w-3 h-3" /> Apto</Button>
                  <Button size="sm" variant="outline" onClick={() => handleExamResult('apto_com_restricao')}>Apto c/ Restrição</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleExamResult('inapto')}>Inapto</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Clínica</Label>
                  <Select value={examClinic} onValueChange={setExamClinic}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {clinics?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Data agendamento</Label>
                  <Input type="datetime-local" value={examDate} onChange={e => setExamDate(e.target.value)} />
                </div>
              </div>
              <Button size="sm" onClick={() => handleCreateExam(examClinic, examDate)}>Agendar Exame</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Registration Checklist */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Cadastros Internos</h3>
          {[
            { field: 'folha_pagamento', label: 'Folha de Pagamento' },
            { field: 'esocial', label: 'eSocial' },
            { field: 'ponto', label: 'Sistema de Ponto' },
            { field: 'sistema_interno', label: 'Sistema Interno' },
            { field: 'entrega_epi', label: 'Entrega de EPI' },
          ].map(item => (
            <div key={item.field} className="flex items-center gap-3">
              <Checkbox
                checked={!!(registration as any)?.[item.field]}
                onCheckedChange={(checked) => handleRegistration(item.field, !!checked)}
              />
              <span className="text-sm">{item.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
