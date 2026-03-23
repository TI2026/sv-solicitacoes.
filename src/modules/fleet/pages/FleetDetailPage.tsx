import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFuelRequest, useFuelAttachments, useFuelSetStatus } from '../hooks/useFleetQueries';
import { useApprovalRequestForReference } from '@/hooks/useApprovalFlow';
import { ApprovalStatusBlock } from '@/components/ApprovalStatusBlock';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusTimeline } from '@/components/StatusTimeline';
import { FUEL_STATUS_LABELS, REQUEST_TYPE_LABELS } from '@/lib/constants';
import { useDynamicCategories } from '@/hooks/useDynamicCategories';
import { ArrowLeft, Loader2, Upload, Send, CheckCircle, XCircle, RotateCcw, DollarSign, Calendar, User, FileImage, Clock, Car, Receipt } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function FleetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasRole, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const { data: req, isLoading, refetch } = useFuelRequest(id!);
  const { data: attachments, refetch: refetchAttachments } = useFuelAttachments(id!);
  const statusMutation = useFuelSetStatus();
  const [uploading, setUploading] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [showReasonDialog, setShowReasonDialog] = useState<string | null>(null);

  const isOwner = req?.requester_user_id === user?.id;
  const isAdmin = hasAnyRole(['diretoria', 'administrativo']);
  const isDiretoria = hasRole('diretoria');
  const reqType = (req as any)?.type || 'abastecimento';

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

  const handleStatusChange = async (toStatus: string, reason?: string) => {
    if (!id || statusMutation.isPending) return;
    await statusMutation.mutateAsync({ requestId: id, toStatus, reason });
    setShowReasonDialog(null);
    setActionReason('');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'hodometro' | 'nota_fiscal') => {
    if (!e.target.files?.[0] || !id) return;
    const file = e.target.files[0];
    
    // Client-side validation
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
  const isPending = statusMutation.isPending;

  // ================== FLUXO DO ABASTECIMENTO ==================
  // 1. Colaborador cria (rascunho) → envia (enviado)
  // 2. Admin encaminha para aprovação (em_aprovacao)
  // 3. Diretoria aprova ou reprova
  // 4. Se aprovado → Admin marca depósito feito (aguardando_fotos)
  // 5. Colaborador envia fotos hodômetro + nota (em_revisao_admin)
  // 6. Admin revisa → conclui ou devolve

  // ================== FLUXO DO REEMBOLSO ==================
  // 1. Colaborador cria → envia (enviado)
  // 2. Admin encaminha para aprovação (em_aprovacao)
  // 3. Diretoria aprova ou reprova
  // 4. Se aprovado → Admin marca como pago/concluído

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
      <Button variant="ghost" className="gap-2" onClick={() => navigate('/fleet')}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

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
            </div>
          </div>

          {reqType === 'abastecimento' && ((req as any).placa || (req as any).km) && (
            <div className="flex gap-4 text-sm text-muted-foreground border-t border-border pt-2">
              {(req as any).placa && <span>🚗 Placa: {(req as any).placa}</span>}
              {(req as any).km && <span>📏 KM: {(req as any).km}</span>}
              {(req as any).motivo && <span>📝 {(req as any).motivo}</span>}
            </div>
          )}
          {reqType === 'reembolso' && (
            <ReembolsoDetails req={req} />
          )}
          {reqType === 'diaria' && (
            <DiariaDetails req={req} />
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

          {/* ADMIN: forward to approval */}
          {isAdmin && req.status === 'enviado' && (
            <Button onClick={() => handleStatusChange('em_aprovacao')} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />} Encaminhar para Aprovação
            </Button>
          )}

          {/* DIRETORIA: approve or reject */}
          {isDiretoria && req.status === 'em_aprovacao' && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleStatusChange('aprovado')} disabled={isPending} className="gap-2">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Aprovar
              </Button>
              <Button onClick={() => setShowReasonDialog('reprovado')} variant="destructive" className="gap-2" disabled={isPending}>
                <XCircle className="w-4 h-4" /> Reprovar
              </Button>
            </div>
          )}

          {/* ABASTECIMENTO: Admin marks card loaded → aguardando_fotos */}
          {isAdmin && reqType === 'abastecimento' && req.status === 'aprovado' && (
            <Button onClick={() => handleStatusChange('aguardando_fotos')} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />} Confirmar Recarga do Cartão
            </Button>
          )}

          {/* OWNER: Send photos for review (abastecimento only) */}
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

          {/* REEMBOLSO: Admin marks as paid after diretoria approval */}
          {isAdmin && reqType === 'reembolso' && req.status === 'aprovado' && (
            <Button onClick={() => handleStatusChange('concluido')} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Marcar como Pago / Concluir
            </Button>
          )}

          {/* Diária: encerrar */}
          {isAdmin && reqType === 'diaria' && req.status === 'ativa' && (
            <Button onClick={() => handleStatusChange('encerrado')} disabled={isPending} className="gap-2" variant="outline">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Encerrar Diária
            </Button>
          )}

          {!isOwner && !isAdmin && !isDiretoria && (
            <p className="text-sm text-muted-foreground">Nenhuma ação disponível</p>
          )}
        </CardContent>
      </Card>

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

      {/* Reason Dialog (mandatory for rejections) */}
      <Dialog open={!!showReasonDialog} onOpenChange={() => setShowReasonDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showReasonDialog === 'reprovado' ? 'Motivo da Recusa' : 'Motivo'}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={actionReason}
            onChange={e => setActionReason(e.target.value.slice(0, 500))}
            placeholder={showReasonDialog === 'reprovado' ? 'Informe o motivo da recusa (obrigatório)...' : 'Descreva o motivo...'}
            rows={3}
            maxLength={500}
          />
          {showReasonDialog === 'reprovado' && actionReason.trim().length < 10 && actionReason.trim().length > 0 && (
            <p className="text-xs text-destructive">Mínimo 10 caracteres</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReasonDialog(null)}>Cancelar</Button>
            <Button
              onClick={() => showReasonDialog && handleStatusChange(showReasonDialog, actionReason)}
              disabled={!actionReason.trim() || (showReasonDialog === 'reprovado' && actionReason.trim().length < 10) || isPending}
              variant={showReasonDialog === 'reprovado' ? 'destructive' : 'default'}
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirmar
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
        <p>PIX ({pixLabel}): {req.pix_key}</p>
      )}
      {req.payment_method === 'banco' && (
        <p>Banco: {req.bank_name} | Ag: {req.bank_agency} | Conta: {req.bank_account}</p>
      )}
    </div>
  );
}

function DiariaDetails({ req }: { req: any }) {
  return (
    <div className="text-sm text-muted-foreground border-t border-border pt-2 space-y-1">
      {req.daily_category && <p>Categoria: {req.daily_category}</p>}
      {req.person_name && <p>Prestador: {req.person_name}</p>}
      {req.hours && <p>Horas: {req.hours}h</p>}
    </div>
  );
}
