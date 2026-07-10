import React, { createContext, useContext, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { refreshApprovalData } from '@/lib/refreshApprovalData';
import { supabase } from '@/integrations/supabase/client';
import { validateFileMagicNumber } from '@/lib/fileValidation';
import { useVehicleByPlate } from '../hooks/useVehicles';
import { 
  useFuelRequest, 
  useFuelAttachments, 
  useFuelSetStatus, 
  useSoftDeleteRequest 
} from '../hooks/useFleetQueries';
import { useApprovalAction } from '../hooks/useApprovalAction';
import { 
  useApprovalRequestForReference, 
  useApprovalRequestsForReference 
} from '@/hooks/useApprovalFlow';
// [Sprint 2 — Onda 1] Contrato canônico do Motor de Aprovação
import { useApprovalContext, type ApprovalContextData } from '../hooks/useApprovalContext';

interface FleetDetailContextData {
  id: string;
  req: any;
  isLoading: boolean;
  refetch: () => void;
  attachments: any[];
  refetchAttachments: () => void;
  approvalRequest: any;
  allApprovalCycles: any[];
  previousCycles: any[];
  statusMutation: any;
  approvalAction: any;
  softDelete: any;

  // [Sprint 2 — Onda 1] Fonte canônica de permissões e visibilidade.
  approvalCtx: ApprovalContextData | undefined;
  approvalCtxLoading: boolean;
  approvalCtxError: Error | null;

  reqType: string;
  vehicle: any;

  canSendToReview: boolean;
  isPending: boolean;
  canUpload: boolean;
  hodometro: any[];
  notaFiscal: any[];

  // Action / State Dialogs
  uploading: boolean;
  setUploading: (v: boolean) => void;
  actionReason: string;
  setActionReason: (v: string) => void;
  showReasonDialog: string | null;
  setShowReasonDialog: (v: string | null) => void;
  showDeleteDialog: boolean;
  setShowDeleteDialog: (v: boolean) => void;
  deleteReason: string;
  setDeleteReason: (v: string) => void;

  // OC / Payment
  ocNumber: string;
  setOcNumber: (v: string) => void;
  ocNotes: string;
  setOcNotes: (v: string) => void;
  paymentNotes: string;
  setPaymentNotes: (v: string) => void;
  showOcDialog: boolean;
  setShowOcDialog: (v: boolean) => void;
  showPaymentDialog: boolean;
  setShowPaymentDialog: (v: boolean) => void;

  // Review (Abastecimento)
  reviewKmReal: string;
  setReviewKmReal: (v: string) => void;
  reviewKmOk: boolean;
  setReviewKmOk: (v: boolean) => void;
  reviewNfReal: string;
  setReviewNfReal: (v: string) => void;
  reviewNfOk: boolean;
  setReviewNfOk: (v: boolean) => void;
  reviewDivergenceReason: string;
  setReviewDivergenceReason: (v: string) => void;

  // Preview
  previewUrl: string | null;
  setPreviewUrl: (v: string | null) => void;
  previewType: 'image' | 'pdf' | null;
  setPreviewType: (v: 'image' | 'pdf' | null) => void;
  previewTitle: string;
  setPreviewTitle: (v: string) => void;

  // Reembolso Checklist
  reembChecklist: { valorConfere: boolean; beneficiarioConfere: boolean; comprovanteOk: boolean; categoriaOk: boolean };
  setReembChecklist: React.Dispatch<React.SetStateAction<{ valorConfere: boolean; beneficiarioConfere: boolean; comprovanteOk: boolean; categoriaOk: boolean }>>;
  reembChecklistComplete: boolean;

  // Handlers
  handleStatusChange: (toStatus: string, reason?: string, metadata?: Record<string, any>) => Promise<void>;
  handleApprovalAction: (action: 'approve' | 'reject' | 'return', comments?: string) => Promise<void>;
  handleOcSubmit: () => Promise<void>;
  handlePaymentConfirm: () => Promise<void>;
  handleUpload: (e: React.ChangeEvent<HTMLInputElement>, type: 'hodometro' | 'nota_fiscal') => Promise<void>;
  openInlinePreview: (path: string, label: string) => Promise<void>;
  getSignedUrl: (path: string) => Promise<void>;
}

const FleetDetailContext = createContext<FleetDetailContextData | undefined>(undefined);

export function FleetDetailProvider({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasAnyRole, isMaster } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: req, isLoading, refetch } = useFuelRequest(id!);
  const { data: attachments, refetch: refetchAttachments } = useFuelAttachments(id!);
  const { data: approvalRequest } = useApprovalRequestForReference(id);
  const { data: allApprovalCycles } = useApprovalRequestsForReference(id);
  const previousCycles = (allApprovalCycles || []).slice(1);
  
  const statusMutation = useFuelSetStatus();
  const softDelete = useSoftDeleteRequest();
  const approvalAction = useApprovalAction();

  // [Sprint 2 — Onda 1] Fonte canônica — carrega o contexto do Motor para este request.
  const reqType_raw = (req as any)?.type || 'abastecimento';
  const {
    data: approvalCtx,
    isLoading: approvalCtxLoading,
    error: approvalCtxError,
  } = useApprovalContext(id, reqType_raw);

  const [uploading, setUploading] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [showReasonDialog, setShowReasonDialog] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

  const [ocNumber, setOcNumber] = useState('');
  const [ocNotes, setOcNotes] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [showOcDialog, setShowOcDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const [reviewKmReal, setReviewKmReal] = useState('');
  const [reviewKmOk, setReviewKmOk] = useState(true);
  const [reviewNfReal, setReviewNfReal] = useState('');
  const [reviewNfOk, setReviewNfOk] = useState(true);
  const [reviewDivergenceReason, setReviewDivergenceReason] = useState('');

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'pdf' | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');

  const [reembChecklist, setReembChecklist] = useState({
    valorConfere: false,
    beneficiarioConfere: false,
    comprovanteOk: false,
    categoriaOk: false,
  });
  const reembChecklistComplete =
    reembChecklist.valorConfere &&
    reembChecklist.beneficiarioConfere &&
    reembChecklist.comprovanteOk &&
    reembChecklist.categoriaOk;

  // isOwner removido (Sprint 5): era duplicata de approvalCtx.
  // Mantido apenas inline nas condições de upload (regra de negócio de UX, não de aprovação).
  const reqType = (req as any)?.type || 'abastecimento';
  const vehicle = useVehicleByPlate((req as any)?.placa);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`fuel-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fuel_requests', filter: `id=eq.${id}` }, (payload) => { 
        refreshApprovalData(qc, id); 
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fuel_attachments', filter: `fuel_request_id=eq.${id}` }, () => { refetchAttachments(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, qc, refetchAttachments]);

  const hodometro = attachments?.filter((a: any) => a.type === 'hodometro') || [];
  const notaFiscal = attachments?.filter((a: any) => a.type === 'nota_fiscal') || [];
  // canUpload e canSendToReview usam a comparação direta: regras de UX de upload,
  // não de aprovação. Não dependem do approvalCtx.
  const canUpload = (req?.requester_user_id === user?.id) && ['aguardando_fotos', 'retornado'].includes(req?.status);
  const canSendToReview = (req?.requester_user_id === user?.id) && req?.status === 'aguardando_fotos' && hodometro.length > 0 && notaFiscal.length > 0;
  const isPending = statusMutation.isPending || approvalAction.isPending || softDelete.isPending;

  const handleStatusChange = async (toStatus: string, reason?: string, metadata?: Record<string, any>) => {
    if (!id || statusMutation.isPending) return;
    const startApproval = toStatus === 'em_aprovacao' && req
      ? { moduleCode: reqType, requesterUserId: req.requester_user_id }
      : undefined;
    await statusMutation.mutateAsync({ requestId: id, toStatus, reason, startApproval });
    // Garantir que o approvalCtx seja invalidado imediatamente após qualquer mudança de status
    refreshApprovalData(qc, id);
    setShowReasonDialog(null);
    setActionReason('');
  };

  const handleApprovalAction = async (action: 'approve' | 'reject' | 'return', comments?: string) => {
    if (!id || !approvalRequest || approvalAction.isPending) return;
    let finalComments = comments;
    if (action === 'approve' && reqType === 'reembolso') {
      const checklistSummary = [
        '✅ Checklist Reembolso:',
        `• Valor confere com comprovante: ${reembChecklist.valorConfere ? 'sim' : 'não'}`,
        `• Beneficiário/CPF conferidos: ${reembChecklist.beneficiarioConfere ? 'sim' : 'não'}`,
        `• Comprovante legível anexado: ${reembChecklist.comprovanteOk ? 'sim' : 'não'}`,
        `• Categoria correta: ${reembChecklist.categoriaOk ? 'sim' : 'não'}`,
      ].join('\n');
      finalComments = comments ? `${checklistSummary}\n\n${comments}` : checklistSummary;
    }
    await approvalAction.mutateAsync({
      approvalRequestId: approvalRequest.id,
      action,
      comments: finalComments || undefined,
      fuelRequestId: id,
      fuelRequestType: reqType,
    });
    // Garantir que o approvalCtx seja invalidado imediatamente após qualquer ação de aprovação
    refreshApprovalData(qc, id);
    setShowReasonDialog(null);
    setActionReason('');
  };

  const handleOcSubmit = async () => {
    if (!id || statusMutation.isPending) return;
    try {
      const { data: result, error } = await supabase.rpc('register_oc_and_advance' as any, {
        _request_id: id,
        _oc_number: ocNumber.trim(),
        _oc_notes: ocNotes.trim() || null,
      } as any);
      if (error) throw error;
      if ((result as any)?.error) throw new Error((result as any).error);

      toast({ title: 'OC registrada com sucesso!' });
      setShowOcDialog(false);
      setOcNumber('');
      setOcNotes('');
      refreshApprovalData(qc, id);
    } catch (err: any) {
      toast({ title: 'Erro ao registrar OC', description: err.message, variant: 'destructive' });
    }
  };

  const handlePaymentConfirm = async () => {
    if (!id || statusMutation.isPending) return;
    try {
      const { data: result, error } = await supabase.rpc('fuel_set_status', {
        _request_id: id,
        _to_status: 'pago' as any,
        _reason: null,
        _metadata: { payment_notes: paymentNotes.trim() || null },
      });
      if (error) throw error;
      if ((result as any)?.error) throw new Error((result as any).error);

      toast({ title: 'Pagamento confirmado!' });
      setShowPaymentDialog(false);
      setPaymentNotes('');
      refreshApprovalData(qc, id);
    } catch (err: any) {
      toast({ title: 'Erro ao confirmar pagamento', description: err.message, variant: 'destructive' });
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'hodometro' | 'nota_fiscal') => {
    if (!e.target.files?.[0] || !id) return;
    const file = e.target.files[0];
    
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 10MB', variant: 'destructive' });
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
    if (!allowed.includes(file.type as any)) {
      toast({ title: 'Tipo de arquivo não permitido', description: 'Use JPEG, PNG, WebP ou PDF', variant: 'destructive' });
      return;
    }

    const isValidMagicNumber = await validateFileMagicNumber(file, allowed as any);
    if (!isValidMagicNumber) {
      toast({ title: 'Arquivo inválido', description: 'O arquivo parece estar corrompido ou ter a extensão forjada.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const { data: signedData, error: fnError } = await supabase.functions.invoke('fleet-create-signed-upload', {
        body: { fuel_request_id: id, file_type: file.type, file_name: file.name, file_size: file.size, attachment_type: type },
      });
      if (fnError || signedData?.error) throw new Error(signedData?.error || fnError?.message || 'Erro ao gerar URL');

      const { error: uploadError } = await supabase.storage.from('fleet').uploadToSignedUrl(signedData.path, signedData.token, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('fuel_attachments').insert({ fuel_request_id: id, type: type as any, file_path: signedData.path });
      if (insertError) throw insertError;
      toast({ title: 'Arquivo enviado com sucesso!' });
      refetchAttachments();
    } catch (err: any) {
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const getSignedUrl = async (path: string) => {
    const { data } = await supabase.storage.from('fleet').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const openInlinePreview = async (path: string, label: string) => {
    const { data } = await supabase.storage.from('fleet').createSignedUrl(path, 300);
    if (!data?.signedUrl) return;
    const isPdf = /\.pdf$/i.test(path);
    setPreviewUrl(data.signedUrl);
    setPreviewType(isPdf ? 'pdf' : 'image');
    setPreviewTitle(label);
  };

  const value = {
    id: id!, req, isLoading, refetch, attachments: attachments || [], refetchAttachments,
    approvalRequest, allApprovalCycles: allApprovalCycles || [], previousCycles,
    statusMutation, approvalAction, softDelete,
    // [Sprint 2 — Onda 1] Contexto canônico do Motor
    approvalCtx, approvalCtxLoading, approvalCtxError: approvalCtxError as Error | null,
    
    reqType, vehicle,
    canSendToReview, isPending, canUpload, hodometro, notaFiscal,
    uploading, setUploading, actionReason, setActionReason, showReasonDialog, setShowReasonDialog,
    showDeleteDialog, setShowDeleteDialog, deleteReason, setDeleteReason,
    ocNumber, setOcNumber, ocNotes, setOcNotes, paymentNotes, setPaymentNotes, showOcDialog, setShowOcDialog,
    showPaymentDialog, setShowPaymentDialog,
    reviewKmReal, setReviewKmReal, reviewKmOk, setReviewKmOk, reviewNfReal, setReviewNfReal,
    reviewNfOk, setReviewNfOk, reviewDivergenceReason, setReviewDivergenceReason,
    previewUrl, setPreviewUrl, previewType, setPreviewType, previewTitle, setPreviewTitle,
    reembChecklist, setReembChecklist, reembChecklistComplete,
    handleStatusChange, handleApprovalAction, handleOcSubmit, handlePaymentConfirm, handleUpload, openInlinePreview, getSignedUrl
  };

  return <FleetDetailContext.Provider value={value}>{children}</FleetDetailContext.Provider>;
}

export function useFleetDetail() {
  const context = useContext(FleetDetailContext);
  if (context === undefined) {
    throw new Error('useFleetDetail must be used within a FleetDetailProvider');
  }
  return context;
}
