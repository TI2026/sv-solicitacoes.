import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { maskCPF, maskPhone, isValidCPF } from '@/lib/masks';
import { isDateTimePast } from '@/lib/dateUtils';
import {
  useAdmissionRequest, useCandidates, useCreateCandidate, useAdmissionSetStatus,
  useUpdateCandidate, useMedicalExam, useGeneratePublicLink, useAdmissionPublicLinks,
  useAdmissionFiles, useAdmissionInterviews, useCreateAdmissionInterview, useUpdateAdmissionInterview
} from '../hooks/useAdmissionQueries';
import { useApprovalRequestForReference, useApprovalRequestsForReference } from '@/hooks/useApprovalFlow';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useCreateCollaboratorFromAdmission } from '@/modules/epis/hooks/useAdmissionToCollaborator';

interface AdmissionDetailContextData {
  id: string;
  req: any;
  isLoading: boolean;
  user: any;
  isRH: boolean;
  hasAnyRole: (roles: string[]) => boolean;

  candidates: any[];
  interviews: any[];
  activeCandidates: any[];
  approvedCandidates: any[];
  hasApprovedCandidates: boolean;
  allActiveHaveInterviewResult: boolean;

  approvalRequest: any;
  allApprovalCycles: any[];
  previousCycles: any[];

  status: string | undefined;
  canEdit: boolean | undefined;

  // Modals & States
  showAddCandidate: boolean;
  setShowAddCandidate: (v: boolean) => void;
  candidateForm: any;
  setCandidateForm: (v: any) => void;
  editCandidateId: string | null;
  setEditCandidateId: (v: string | null) => void;
  showDeleteConfirm: string | null;
  setShowDeleteConfirm: (v: string | null) => void;
  interviewCandidate: any | null;
  setInterviewCandidate: (v: any) => void;
  generatedLinks: Record<string, string>;
  linksGenerating: boolean;
  docsConfirmed: boolean;
  setDocsConfirmed: (v: boolean) => void;
  showEditDialog: boolean;
  setShowEditDialog: (v: boolean) => void;

  // Handlers
  handleStatusChange: (toStatus: string, reason?: string) => Promise<void>;
  handleAddCandidate: () => Promise<void>;
  handleEditCandidate: (c: any) => void;
  handleDeleteCandidate: (candidateId: string) => Promise<void>;
  handleScheduleInterview: (data: any) => Promise<void>;
  handleInterviewResult: (candidateId: string, approved: boolean) => Promise<void>;
  handleConfirmInterview: (candidateId: string) => Promise<void>;
  copyToClipboard: (text: string) => void;
  generateLinksForCandidates: (linkType: 'DOCUMENTS' | 'SIGNATURE') => Promise<void>;
  isInterviewPast: (interviewAt: string | null) => boolean;
  getInterviewStatusLabel: (c: any) => { label: string; variant: string };
  canDecideInterview: (c: any) => boolean;
  updateInterview: any;
}

const AdmissionDetailContext = createContext<AdmissionDetailContextData | undefined>(undefined);

export function AdmissionDetailProvider({ children }: { children: React.ReactNode }) {
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
  const { data: interviews } = useAdmissionInterviews(id!);

  const createCandidate = useCreateCandidate();
  const updateCandidate = useUpdateCandidate();
  const createInterview = useCreateAdmissionInterview();
  const updateInterview = useUpdateAdmissionInterview();
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
      { table: 'admission_interviews', filter: `admission_request_id=eq.${id}`, queryKeys: [['admission_interviews', id!]] },
      { table: 'notifications', queryKeys: [['notifications']] },
    ],
  });

  const handleStatusChange = async (toStatus: string, reason?: string) => {
    if (!id) return;
    await statusMutation.mutateAsync({ requestId: id, toStatus, reason });
  };

  const cpfDigits = candidateForm.cpf.replace(/\D/g, '');
  const phoneDigits = candidateForm.telefone.replace(/\D/g, '');

  const handleAddCandidate = async () => {
    if (!id || !candidateForm.nome || createCandidate.isPending) return;
    if (cpfDigits.length > 0 && (cpfDigits.length !== 11 || !isValidCPF(cpfDigits))) {
      toast({ title: 'CPF inválido', variant: 'destructive' }); return;
    }

    const existingCandidates = candidates || [];
    const normalizedEmail = candidateForm.email?.trim().toLowerCase();
    for (const existing of existingCandidates) {
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
        data: { nome: candidateForm.nome, cpf: cpfDigits || null, telefone: phoneDigits || null, email: candidateForm.email || null, cidade: candidateForm.cidade || null },
      });
      setEditCandidateId(null);
    } else {
      await createCandidate.mutateAsync({
        admission_request_id: id, nome: candidateForm.nome, cpf: cpfDigits || null, telefone: phoneDigits || null, email: candidateForm.email || null, cidade: candidateForm.cidade || null,
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
    if (!interviewCandidate || !id) return;
    await createInterview.mutateAsync({
      admission_request_id: id, candidate_id: interviewCandidate.id, scheduled_at: data.interview_at,
      conducted_by: data.conducted_by || undefined, interview_mode: data.interview_mode || 'presencial',
      interview_address: data.interview_address || undefined, interview_city: data.interview_city || undefined,
      meeting_link: data.meeting_link || undefined, result: data.result && data.result !== '_empty' ? data.result : undefined,
      notes: data.interview_notes || undefined,
    });
    await updateCandidate.mutateAsync({
      id: interviewCandidate.id,
      data: {
        interview_at: data.interview_at, interview_address: data.interview_address, interview_city: data.interview_city,
        interviewer_name: data.interviewer_name, interview_notes: data.interview_notes || null,
        interview_mode: data.interview_mode || 'presencial', meeting_link: data.meeting_link || null,
      },
    });
  };

  const handleInterviewResult = async (candidateId: string, approved: boolean) => {
    await updateCandidate.mutateAsync({
      id: candidateId,
      data: { interview_approved: approved, status_triagem: approved ? ('aprovado' as any) : ('reprovado' as any) },
    });
    toast({ title: approved ? 'Candidato aprovado na entrevista!' : 'Candidato eliminado' });
  };

  const handleConfirmInterview = async (candidateId: string) => {
    const currentUser = (await supabase.auth.getUser()).data.user;
    await updateCandidate.mutateAsync({
      id: candidateId,
      data: { interview_confirmed_at: new Date().toISOString(), interview_confirmed_by: currentUser?.id || null },
    });
    toast({ title: 'Entrevista confirmada como realizada!' });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Link copiado!' });
  };

  const activeCandidates = useMemo(() => candidates?.filter((c: any) => c.status_triagem !== 'reprovado' && c.status_triagem !== 'desistente') || [], [candidates]);
  const approvedCandidates = useMemo(() => candidates?.filter((c: any) => c.interview_approved === true) || [], [candidates]);

  const allActiveHaveInterviewResult = useMemo(() => {
    if (!candidates || candidates.length === 0) return false;
    const active = candidates.filter((c: any) => c.status_triagem !== 'desistente');
    return active.length > 0 && active.every((c: any) => c.interview_approved === true || c.interview_approved === false);
  }, [candidates]);

  const hasApprovedCandidates = approvedCandidates.length > 0;
  const isInterviewPast = (interviewAt: string | null): boolean => isDateTimePast(interviewAt);

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
        const result = await generatePublicLink.mutateAsync({ admissionRequestId: id, candidateId: c.id, linkType });
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

  const value = {
    id: id!, req, isLoading, user, isRH, hasAnyRole,
    candidates: candidates || [], interviews: interviews || [],
    activeCandidates, approvedCandidates, hasApprovedCandidates, allActiveHaveInterviewResult,
    approvalRequest, allApprovalCycles: allApprovalCycles || [], previousCycles,
    status, canEdit,
    showAddCandidate, setShowAddCandidate, candidateForm, setCandidateForm,
    editCandidateId, setEditCandidateId, showDeleteConfirm, setShowDeleteConfirm,
    interviewCandidate, setInterviewCandidate, generatedLinks, linksGenerating,
    docsConfirmed, setDocsConfirmed, showEditDialog, setShowEditDialog,
    handleStatusChange, handleAddCandidate, handleEditCandidate, handleDeleteCandidate,
    handleScheduleInterview, handleInterviewResult, handleConfirmInterview,
    copyToClipboard, generateLinksForCandidates, isInterviewPast, getInterviewStatusLabel, canDecideInterview,
    updateInterview
  };

  return <AdmissionDetailContext.Provider value={value}>{children}</AdmissionDetailContext.Provider>;
}

export function useAdmissionDetail() {
  const context = useContext(AdmissionDetailContext);
  if (context === undefined) {
    throw new Error('useAdmissionDetail must be used within a AdmissionDetailProvider');
  }
  return context;
}
