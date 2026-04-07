import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFuelRequest, useFuelAttachments, useFuelSetStatus, useSoftDeleteRequest } from '../hooks/useFleetQueries';
import { useQuery } from '@tanstack/react-query';
import { useApprovalAction } from '../hooks/useApprovalAction';
import { useApprovalRequestForReference, useApprovalRequestsForReference } from '@/hooks/useApprovalFlow';
import { ApprovalStatusBlock } from '@/components/ApprovalStatusBlock';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusTimeline } from '@/components/StatusTimeline';
import { FUEL_STATUS_LABELS, REQUEST_TYPE_LABELS } from '@/lib/constants';
import { useDynamicCategories } from '@/hooks/useDynamicCategories';
import { ArrowLeft, Loader2, Upload, Send, CheckCircle, XCircle, RotateCcw, DollarSign, Calendar, User, FileImage, Clock, Car, Receipt, FileText, CreditCard, CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { assignReviewerByRequesterSector } from '@/lib/resolveAssignee';

export default function FleetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasRole, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const { data: req, isLoading, refetch } = useFuelRequest(id!);
  const { data: attachments, refetch: refetchAttachments } = useFuelAttachments(id!);
  const { data: approvalRequest } = useApprovalRequestForReference(id);
  const { data: allApprovalCycles } = useApprovalRequestsForReference(id);
  const previousCycles = (allApprovalCycles || []).slice(1);
  const statusMutation = useFuelSetStatus();
  const approvalAction = useApprovalAction();
  const [uploading, setUploading] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [showReasonDialog, setShowReasonDialog] = useState<string | null>(null);

  // OC/Payment metadata fields
  const [ocNumber, setOcNumber] = useState('');
  const [ocNotes, setOcNotes] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [showOcDialog, setShowOcDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const isOwner = req?.requester_user_id === user?.id;
  const isAdmin = hasAnyRole(['diretoria', 'administrativo']);
  const reqType = (req as any)?.type || 'abastecimento';

  // ===== APPROVAL FLOW ELIGIBILITY =====
  const isCurrentFlowApprover = approvalRequest
    ? approvalRequest.current_approver_user_id === user?.id && !approvalRequest.ended_at
    : false;

  const flowAllowsReturn = approvalRequest?.approval_flows?.allow_return_for_adjustment ?? false;
  const hasActiveFlow = !!approvalRequest && !approvalRequest.ended_at;

  // Realtime subscription
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`fuel-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fuel_requests', filter: `id=eq.${id}` }, () => { refetch(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fuel_attachments', filter: `fuel_request_id=eq.${id}` }, () => { refetchAttachments(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  /** Operational status change (NOT approval actions) */
  const handleStatusChange = async (toStatus: string, reason?: string, metadata?: Record<string, any>) => {
    if (!id || statusMutation.isPending) return;
    const startApproval = toStatus === 'em_aprovacao' && req
      ? { moduleCode: reqType, requesterUserId: req.requester_user_id }
      : undefined;
    await statusMutation.mutateAsync({ requestId: id, toStatus, reason, startApproval });

    // Auto-assign reviewer by sector when sending
    if (toStatus === 'enviado' && req?.requester_user_id) {
      assignReviewerByRequesterSector(id, req.requester_user_id).then(assignee => {
        if (assignee) refetch();
      });
    }

    setShowReasonDialog(null);
    setActionReason('');
  };

  /** Approval flow action (approve/reject/return) — uses process_approval_action */
  const handleApprovalAction = async (action: 'approve' | 'reject' | 'return', comments?: string) => {
    if (!id || !approvalRequest || approvalAction.isPending) return;
    await approvalAction.mutateAsync({
      approvalRequestId: approvalRequest.id,
      action,
      comments: comments || undefined,
      fuelRequestId: id,
      fuelRequestType: reqType,
    });
    setShowReasonDialog(null);
    setActionReason('');
  };

  /** Handle OC submission: aprovado -> aguardando_oc -> aguardando_pagamento (two-step) */
  const handleOcSubmit = async () => {
    if (!id || statusMutation.isPending) return;
    try {
      // Step 1: aprovado -> aguardando_oc
      await statusMutation.mutateAsync({
        requestId: id,
        toStatus: 'aguardando_oc',
        reason: null,
      });
      // Step 2: aguardando_oc -> aguardando_pagamento with OC metadata
      const { data: result, error } = await supabase.rpc('fuel_set_status', {
        _request_id: id,
        _to_status: 'aguardando_pagamento' as any,
        _reason: null,
        _metadata: {
          oc_number: ocNumber.trim() || null,
          oc_notes: ocNotes.trim() || null,
        },
      });
      if (error) throw error;
      if ((result as any)?.error) throw new Error((result as any).error);

      toast({ title: 'OC registrada com sucesso!' });
      setShowOcDialog(false);
      setOcNumber('');
      setOcNotes('');
      refetch();
    } catch (err: any) {
      toast({ title: 'Erro ao registrar OC', description: err.message, variant: 'destructive' });
    }
  };

  /** Handle payment confirmation */
  const handlePaymentConfirm = async () => {
    if (!id || statusMutation.isPending) return;
    try {
      const { data: result, error } = await supabase.rpc('fuel_set_status', {
        _request_id: id,
        _to_status: 'pago' as any,
        _reason: null,
        _metadata: {
          payment_notes: paymentNotes.trim() || null,
        },
      });
      if (error) throw error;
      if ((result as any)?.error) throw new Error((result as any).error);

      toast({ title: 'Pagamento confirmado!' });
      setShowPaymentDialog(false);
      setPaymentNotes('');
      refetch();
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
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      toast({ title: 'Tipo de arquivo não permitido', description: 'Use JPEG, PNG, WebP ou PDF', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const { data: signedData, error: fnError } = await supabase.functions.invoke('fleet-create-signed-upload', {
        body: {
          fuel_request_id: id,
          file_type: file.type,
          file_name: file.name,
          file_size: file.size,
          attachment_type: type,
        },
      });
      if (fnError || signedData?.error) throw new Error(signedData?.error || fnError?.message || 'Erro ao gerar URL');

      const { error: uploadError } = await supabase.storage.from('fleet').uploadToSignedUrl(
        signedData.path, signedData.token, file
      );
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('fuel_attachments').insert({
        fuel_request_id: id, type: type as any, file_path: signedData.path,
      });
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

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!req) return <p className="text-center py-12 text-muted-foreground">Solicitação não encontrada</p>;

  const hodometro = attachments?.filter((a: any) => a.type === 'hodometro') || [];
  const notaFiscal = attachments?.filter((a: any) => a.type === 'nota_fiscal') || [];
  const canUpload = isOwner && ['aguardando_fotos', 'retornado'].includes(req.status);
  const canSendToReview = isOwner && req.status === 'aguardando_fotos' && hodometro.length > 0 && notaFiscal.length > 0;
  const isPending = statusMutation.isPending || approvalAction.isPending;

  /** Determines which handler to call from the reason dialog */
  const handleReasonConfirm = () => {
    if (!showReasonDialog) return;
    if (hasActiveFlow && isCurrentFlowApprover && req.status === 'em_aprovacao') {
      if (showReasonDialog === 'reprovado') {
        handleApprovalAction('reject', actionReason);
      } else if (showReasonDialog === 'retornado') {
        handleApprovalAction('return', actionReason);
      }
    } else {
      handleStatusChange(showReasonDialog, actionReason);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
      <Button variant="ghost" className="gap-2" onClick={() => navigate('/fleet')}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

      {/* Return alert for owner */}
      {req?.status === 'retornado' && isOwner && (
        <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-400">Solicitação devolvida para ajuste</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            {(() => {
              const reason = req.review_notes || (allApprovalCycles?.[0] as any)?.approval_request_steps?.find((s: any) => s.status === 'returned')?.comments;
              return reason ? <p className="mb-2">Motivo: {reason}</p> : null;
            })()}
            <p className="mb-2">Edite os dados necessários e reenvie a solicitação.</p>
            <Button size="sm" className="gap-1" onClick={() => handleStatusChange('enviado')} disabled={isPending}>
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Reenviar solicitação
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              {reqType === 'reembolso' ? <Receipt className="w-5 h-5" /> : reqType === 'diaria' ? <DollarSign className="w-5 h-5" /> : <Car className="w-5 h-5" />}
              {REQUEST_TYPE_LABELS[reqType] || 'Solicitação'}
            </CardTitle>
            <StatusBadge status={req.status} label={FUEL_STATUS_LABELS[req.status] || req.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="w-4 h-4" />
              <span>R$ {Number(req.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>{new Date(req.data_abastecimento + 'T12:00:00').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground col-span-2">
              <User className="w-4 h-4" />
              <span>{(req as any).profiles?.full_name || 'Usuário'}</span>
              {(req as any).assignee?.full_name && (
                <Badge variant="secondary" className="text-[10px] ml-2">📋 Atribuído: {(req as any).assignee.full_name}</Badge>
              )}
            </div>
          </div>

          {reqType === 'abastecimento' && ((req as any).placa || (req as any).km) && (
            <div className="flex gap-4 text-sm text-muted-foreground border-t border-border pt-2">
              {(req as any).placa && <span>🚗 Placa: {(req as any).placa}</span>}
              {(req as any).km && <span>📏 KM: {(req as any).km}</span>}
              {(req as any).motivo && <span>📝 {(req as any).motivo}</span>}
            </div>
          )}
          {reqType === 'reembolso' && <ReembolsoDetails req={req} />}
          {reqType === 'diaria' && <DiariaDetails req={req} />}

          {/* OC/Payment info if available */}
          {(req as any).oc_number && (
            <div className="text-sm text-muted-foreground border-t border-border pt-2">
              <p className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> OC: {(req as any).oc_number}</p>
              {(req as any).oc_notes && <p className="text-xs mt-1">{(req as any).oc_notes}</p>}
            </div>
          )}
          {(req as any).paid_at && (
            <div className="text-sm text-muted-foreground border-t border-border pt-2">
              <p className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> Pago em: {new Date((req as any).paid_at).toLocaleDateString('pt-BR')}</p>
              {(req as any).payment_notes && <p className="text-xs mt-1">{(req as any).payment_notes}</p>}
            </div>
          )}

          {req.notes && <p className="text-sm text-muted-foreground border-t border-border pt-2 mt-2">{req.notes}</p>}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Ações</h3>

          {/* OWNER: send draft */}
          {isOwner && req.status === 'rascunho' && (
            <Button onClick={() => handleStatusChange('enviado')} disabled={isPending} className="gap-2 w-full sm:w-auto">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar Solicitação
            </Button>
          )}

          {/* OWNER: resend after return */}
          {isOwner && req.status === 'retornado' && (
            <Button onClick={() => handleStatusChange('enviado')} disabled={isPending} className="gap-2 w-full sm:w-auto">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Reenviar
            </Button>
          )}

          {/* ADMIN: forward to review (diária) */}
          {isAdmin && reqType === 'diaria' && req.status === 'enviado' && (
            <Button onClick={() => handleStatusChange('em_revisao')} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />} Revisar Diária
            </Button>
          )}

          {/* ADMIN: forward from review to approval (diária) */}
          {isAdmin && reqType === 'diaria' && req.status === 'em_revisao' && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleStatusChange('em_aprovacao')} disabled={isPending} className="gap-2">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />} Encaminhar para Aprovação
              </Button>
              <Button onClick={() => setShowReasonDialog('retornado')} variant="outline" className="gap-2" disabled={isPending}>
                <RotateCcw className="w-4 h-4" /> Devolver
              </Button>
            </div>
          )}

          {/* ADMIN: forward to approval (abastecimento/reembolso) */}
          {isAdmin && reqType !== 'diaria' && req.status === 'enviado' && (
            <Button onClick={() => handleStatusChange('em_aprovacao')} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />} Encaminhar para Aprovação
            </Button>
          )}

          {/* APPROVAL FLOW: approve/reject/return — ONLY for eligible approver of current step */}
          {req.status === 'em_aprovacao' && hasActiveFlow && isCurrentFlowApprover && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleApprovalAction('approve')} disabled={isPending} className="gap-2">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Aprovar
              </Button>
              <Button onClick={() => setShowReasonDialog('reprovado')} variant="destructive" className="gap-2" disabled={isPending}>
                <XCircle className="w-4 h-4" /> Reprovar
              </Button>
              {flowAllowsReturn && (
                <Button onClick={() => setShowReasonDialog('retornado')} variant="outline" className="gap-2" disabled={isPending}>
                  <RotateCcw className="w-4 h-4" /> Devolver
                </Button>
              )}
            </div>
          )}

          {/* LEGACY: em_aprovacao without active flow — fallback to old isDiretoria */}
          {req.status === 'em_aprovacao' && !hasActiveFlow && hasRole('diretoria') && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleStatusChange('aprovado')} disabled={isPending} className="gap-2">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Aprovar
              </Button>
              <Button onClick={() => setShowReasonDialog('reprovado')} variant="destructive" className="gap-2" disabled={isPending}>
                <XCircle className="w-4 h-4" /> Reprovar
              </Button>
            </div>
          )}

          {/* Info for non-eligible users viewing em_aprovacao with active flow */}
          {req.status === 'em_aprovacao' && hasActiveFlow && !isCurrentFlowApprover && isAdmin && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              Esta solicitação está em fluxo de aprovação. Apenas o aprovador elegível da etapa atual pode agir.
            </p>
          )}

          {/* ABASTECIMENTO: Admin marks card loaded */}
          {isAdmin && reqType === 'abastecimento' && req.status === 'aprovado' && (
            <Button onClick={() => handleStatusChange('aguardando_fotos')} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />} Confirmar Recarga do Cartão
            </Button>
          )}

          {/* OWNER: Send photos for review */}
          {canSendToReview && (
            <Button onClick={() => handleStatusChange('em_revisao_admin')} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar para Revisão
            </Button>
          )}

          {/* ADMIN: Final review for abastecimento */}
          {isAdmin && reqType === 'abastecimento' && req.status === 'em_revisao_admin' && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleStatusChange('concluido')} disabled={isPending} className="gap-2">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Finalizar
              </Button>
              <Button onClick={() => setShowReasonDialog('retornado')} variant="outline" className="gap-2" disabled={isPending}>
                <RotateCcw className="w-4 h-4" /> Devolver (Reenviar fotos)
              </Button>
            </div>
          )}

          {/* REEMBOLSO: Admin marks as paid */}
          {isAdmin && reqType === 'reembolso' && req.status === 'aprovado' && (
            <Button onClick={() => handleStatusChange('concluido')} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Marcar como Pago / Concluir
            </Button>
          )}

          {/* ===== DIÁRIA POST-APPROVAL FLOW ===== */}

          {/* DIÁRIA: Aprovado -> Anexar OC (transitions aprovado -> aguardando_oc -> aguardando_pagamento) */}
          {isAdmin && reqType === 'diaria' && req.status === 'aprovado' && (
            <Button onClick={() => setShowOcDialog(true)} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Anexar OC
            </Button>
          )}

          {/* DIÁRIA: Aguardando OC -> fill OC and advance */}
          {isAdmin && reqType === 'diaria' && req.status === 'aguardando_oc' && (
            <Button onClick={() => setShowOcDialog(true)} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Confirmar OC
            </Button>
          )}

          {/* DIÁRIA: Aguardando Pagamento -> Pago */}
          {isAdmin && reqType === 'diaria' && req.status === 'aguardando_pagamento' && (
            <Button onClick={() => setShowPaymentDialog(true)} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Confirmar Pagamento
            </Button>
          )}

          {/* DIÁRIA: Pago -> Concluído */}
          {isAdmin && reqType === 'diaria' && req.status === 'pago' && (
            <Button onClick={() => handleStatusChange('concluido')} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Concluir
            </Button>
          )}

          {/* DIÁRIA legacy: encerrar (from ativa) */}
          {isAdmin && reqType === 'diaria' && req.status === 'ativa' && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleStatusChange('em_revisao')} disabled={isPending} className="gap-2">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />} Encaminhar para Revisão
              </Button>
              <Button onClick={() => handleStatusChange('encerrado')} disabled={isPending} className="gap-2" variant="outline">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Encerrar Diária
              </Button>
            </div>
          )}

          {!isOwner && !isAdmin && !isCurrentFlowApprover && req.status !== 'em_aprovacao' && (
            <p className="text-sm text-muted-foreground">Nenhuma ação disponível</p>
          )}
        </CardContent>
      </Card>

      {/* Approval Flow Status */}
      {approvalRequest && <ApprovalStatusBlock approvalRequest={approvalRequest} previousCycles={previousCycles} />}

      {/* Approval Steps Queue */}
      {hasActiveFlow && approvalRequest?.approval_request_steps && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Fila de Aprovadores</h3>
            <div className="space-y-2">
              {(approvalRequest.approval_request_steps as any[])
                .sort((a: any, b: any) => a.step_order - b.step_order)
                .map((step: any) => {
                  const isApproved = step.status === 'approved';
                  const isCurrent = step.step_order === approvalRequest.current_step_order && !approvalRequest.ended_at;
                  const isPendingStep = step.status === 'pending' && !isCurrent;
                  const isMe = step.approver_user_id === user?.id;

                  return (
                    <div
                      key={step.id}
                      className={`flex items-center gap-3 p-2 rounded-lg ${isCurrent && isMe ? 'border-2 border-primary bg-primary/5' : 'border border-border'}`}
                    >
                      {isApproved && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                      {isCurrent && <Clock className="w-4 h-4 text-amber-500 shrink-0" />}
                      {isPendingStep && <Circle className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <span className="text-sm flex-1">{step.profiles?.full_name || 'Aprovador'}</span>
                      <Badge variant={isApproved ? 'default' : isCurrent ? 'secondary' : 'outline'} className="text-[10px]">
                        {isApproved ? 'Aprovado' : isCurrent ? 'Aguardando' : 'Pendente'}
                      </Badge>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attachments (abastecimento) */}
      {reqType === 'abastecimento' && (canUpload || (attachments && attachments.length > 0)) && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileImage className="w-4 h-4" /> Anexos
            </h3>
            {canUpload && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Hodômetro {hodometro.length > 0 ? '✅' : '*'}</Label>
                  <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => handleUpload(e, 'hodometro')} disabled={uploading} />
                  <p className="text-[10px] text-muted-foreground">JPEG, PNG, PDF — Máx 10MB</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nota Fiscal {notaFiscal.length > 0 ? '✅' : '*'}</Label>
                  <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => handleUpload(e, 'nota_fiscal')} disabled={uploading} />
                  <p className="text-[10px] text-muted-foreground">JPEG, PNG, PDF — Máx 10MB</p>
                </div>
              </div>
            )}
            {uploading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Enviando...
              </div>
            )}
            {attachments && attachments.length > 0 && (
              <div className="space-y-2">
                {attachments.map((att: any) => (
                  <div key={att.id} className="flex items-center justify-between text-sm border border-border rounded-lg p-2">
                    <span className="text-muted-foreground">{att.type === 'hodometro' ? '📷 Hodômetro' : '🧾 Nota Fiscal'}</span>
                    <Button variant="ghost" size="sm" onClick={() => getSignedUrl(att.file_path)}>Ver</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Histórico</h3>
          <StatusTimeline entityId={id!} entityType="fuel_requests" module="fleet" statusLabels={FUEL_STATUS_LABELS} />
        </CardContent>
      </Card>

      {/* Reason Dialog — mandatory justification for reject & return */}
      <Dialog open={!!showReasonDialog} onOpenChange={() => setShowReasonDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showReasonDialog === 'reprovado' ? 'Motivo da Recusa' : 'Motivo da Devolução'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            A justificativa é obrigatória.
          </p>
          <Textarea
            value={actionReason}
            onChange={e => setActionReason(e.target.value.slice(0, 500))}
            placeholder={showReasonDialog === 'reprovado' ? 'Informe o motivo da recusa (mínimo 10 caracteres)...' : 'Informe o motivo da devolução (mínimo 5 caracteres)...'}
            rows={3}
            maxLength={500}
          />
          {showReasonDialog === 'reprovado' && actionReason.trim().length > 0 && actionReason.trim().length < 10 && (
            <p className="text-xs text-destructive">Mínimo 10 caracteres</p>
          )}
          {showReasonDialog !== 'reprovado' && actionReason.trim().length > 0 && actionReason.trim().length < 5 && (
            <p className="text-xs text-destructive">Mínimo 5 caracteres</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReasonDialog(null)}>Cancelar</Button>
            <Button
              onClick={handleReasonConfirm}
              disabled={
                !actionReason.trim() ||
                (showReasonDialog === 'reprovado' && actionReason.trim().length < 10) ||
                (showReasonDialog !== 'reprovado' && actionReason.trim().length < 5) ||
                isPending
              }
              variant={showReasonDialog === 'reprovado' ? 'destructive' : 'default'}
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OC Dialog */}
      <Dialog open={showOcDialog} onOpenChange={setShowOcDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anexar Ordem de Compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Número da OC *</Label>
              <Input value={ocNumber} onChange={e => setOcNumber(e.target.value.slice(0, 50))} placeholder="Ex: OC-2026-001" maxLength={50} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Textarea value={ocNotes} onChange={e => setOcNotes(e.target.value.slice(0, 300))} placeholder="Detalhes da OC..." rows={2} maxLength={300} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOcDialog(false)}>Cancelar</Button>
            <Button onClick={handleOcSubmit} disabled={isPending || !ocNumber.trim()} className="gap-2">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmar OC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Observações do Pagamento</Label>
              <Textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value.slice(0, 300))} placeholder="Comprovante, referência..." rows={2} maxLength={300} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancelar</Button>
            <Button onClick={handlePaymentConfirm} disabled={isPending} className="gap-2">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReembolsoDetails({ req }: { req: any }) {
  const pixKeyType = req.pix_key_type;
  const pixLabel = pixKeyType === 'celular' ? 'Celular' : pixKeyType === 'cpf' ? 'CPF' : 'Chave';
  return (
    <div className="text-sm text-muted-foreground border-t border-border pt-2 space-y-1">
      {req.categoria && <p>Categoria: {req.categoria}</p>}
      {req.payment_method === 'pix' && req.pix_key && (
        <p>Pix ({pixLabel}): {req.pix_key}</p>
      )}
      {req.payment_method === 'conta_bancaria' && (
        <>
          {req.bank_name && <p>Banco: {req.bank_name}</p>}
          {req.bank_agency && <p>Agência: {req.bank_agency}</p>}
          {req.bank_account && <p>Conta: {req.bank_account}</p>}
        </>
      )}
      {req.person_name && <p>Beneficiário: {req.person_name}</p>}
      {req.person_cpf && <p>CPF: {req.person_cpf}</p>}
      {req.motivo && <p>Motivo: {req.motivo}</p>}
    </div>
  );
}

function DiariaDetails({ req }: { req: any }) {
  const { categories } = useDynamicCategories('fleet', 'daily_category');
  const catLabel = categories?.find((c: any) => c.label === req.daily_category)?.label || req.daily_category;
  return (
    <div className="text-sm text-muted-foreground border-t border-border pt-2 space-y-1">
      {req.daily_category && <p>Categoria: {catLabel}</p>}
      {req.daily_value && <p>Valor diário: R$ {Number(req.daily_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>}
      {req.hours && <p>Horas: {req.hours}h</p>}
      {req.person_name && <p>Profissional: {req.person_name}</p>}
      {req.person_cpf && <p>CPF: {req.person_cpf}</p>}
      {req.payment_method === 'pix' && req.pix_key && (
        <p>Pix: {req.pix_key}</p>
      )}
      {req.payment_method === 'conta_bancaria' && (
        <>
          {req.bank_name && <p>Banco: {req.bank_name}</p>}
          {req.bank_agency && <p>Agência: {req.bank_agency}</p>}
          {req.bank_account && <p>Conta: {req.bank_account}</p>}
        </>
      )}
      {req.motivo && <p>Motivo: {req.motivo}</p>}
    </div>
  );
}
