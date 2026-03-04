import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFuelRequest, useFuelAttachments, useFuelSetStatus } from '../hooks/useFleetQueries';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusTimeline } from '@/components/StatusTimeline';
import { FUEL_STATUS_LABELS, REQUEST_TYPE_LABELS, REEMBOLSO_CATEGORIAS, DIARIA_CATEGORIAS } from '@/lib/constants';
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fuel_attachments', filter: `fuel_request_id=eq.${id}` }, () => { refetchAttachments(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const handleStatusChange = async (toStatus: string, reason?: string) => {
    if (!id) return;
    await statusMutation.mutateAsync({ requestId: id, toStatus, reason });
    setShowReasonDialog(null);
    setActionReason('');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'hodometro' | 'nota_fiscal') => {
    if (!e.target.files?.[0] || !id) return;
    const file = e.target.files[0];
    setUploading(true);
    try {
      const path = `requests/${id}/${type}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('fleet').upload(path, file);
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from('fuel_attachments').insert({
        fuel_request_id: id, type: type as any, file_path: path,
      });
      if (insertError) throw insertError;
      toast({ title: 'Arquivo enviado!' });
      refetchAttachments();
    } catch (err: any) {
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
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
              <span>{new Date(req.data_abastecimento).toLocaleDateString('pt-BR')}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground col-span-2">
              <User className="w-4 h-4" />
              <span>{(req as any).profiles?.full_name || 'Usuário'}</span>
            </div>
          </div>

          {/* Type-specific details */}
          {reqType === 'abastecimento' && ((req as any).placa || (req as any).km) && (
            <div className="flex gap-4 text-sm text-muted-foreground border-t border-border pt-2">
              {(req as any).placa && <span>🚗 Placa: {(req as any).placa}</span>}
              {(req as any).km && <span>📏 KM: {(req as any).km}</span>}
              {(req as any).motivo && <span>📝 {(req as any).motivo}</span>}
            </div>
          )}
          {reqType === 'reembolso' && (
            <div className="text-sm text-muted-foreground border-t border-border pt-2 space-y-1">
              {(req as any).categoria && <p>Categoria: {REEMBOLSO_CATEGORIAS.find(c => c.value === (req as any).categoria)?.label || (req as any).categoria}</p>}
              {(req as any).payment_method === 'pix' && (req as any).pix_key && <p>PIX: {(req as any).pix_key}</p>}
              {(req as any).payment_method === 'banco' && <p>Banco: {(req as any).bank_name} | Ag: {(req as any).bank_agency} | Conta: {(req as any).bank_account}</p>}
            </div>
          )}
          {reqType === 'diaria' && (
            <div className="text-sm text-muted-foreground border-t border-border pt-2 space-y-1">
              {(req as any).daily_category && <p>Categoria: {DIARIA_CATEGORIAS.find(c => c.value === (req as any).daily_category)?.label || (req as any).daily_category}</p>}
              {(req as any).person_name && <p>Prestador: {(req as any).person_name}</p>}
              {(req as any).hours && <p>Horas: {(req as any).hours}h</p>}
            </div>
          )}

          {req.notes && <p className="text-sm text-muted-foreground border-t border-border pt-2 mt-2">{req.notes}</p>}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Ações</h3>

          {isOwner && req.status === 'rascunho' && (
            <Button onClick={() => handleStatusChange('enviado')} className="gap-2 w-full sm:w-auto">
              <Send className="w-4 h-4" /> Enviar Solicitação
            </Button>
          )}

          {isOwner && req.status === 'retornado' && (
            <Button onClick={() => handleStatusChange('enviado')} className="gap-2 w-full sm:w-auto">
              <Send className="w-4 h-4" /> Reenviar
            </Button>
          )}

          {isDiretoria && req.status === 'em_aprovacao' && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleStatusChange('aprovado')} className="gap-2">
                <CheckCircle className="w-4 h-4" /> Aprovar
              </Button>
              <Button onClick={() => setShowReasonDialog('retornado')} variant="outline" className="gap-2">
                <RotateCcw className="w-4 h-4" /> Devolver
              </Button>
              <Button onClick={() => setShowReasonDialog('reprovado')} variant="destructive" className="gap-2">
                <XCircle className="w-4 h-4" /> Reprovar
              </Button>
            </div>
          )}

          {isAdmin && req.status === 'enviado' && (
            <Button onClick={() => handleStatusChange('em_aprovacao')} className="gap-2">
              <Clock className="w-4 h-4" /> Encaminhar para Aprovação
            </Button>
          )}

          {canSendToReview && (
            <Button onClick={() => handleStatusChange('em_revisao_admin')} className="gap-2">
              <Send className="w-4 h-4" /> Enviar para Revisão
            </Button>
          )}

          {isAdmin && req.status === 'em_revisao_admin' && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleStatusChange('concluido')} className="gap-2">
                <CheckCircle className="w-4 h-4" /> Concluir (Aprovado)
              </Button>
              <Button onClick={() => setShowReasonDialog('retornado')} variant="outline" className="gap-2">
                <RotateCcw className="w-4 h-4" /> Devolver
              </Button>
            </div>
          )}

          {/* Reembolso: mark as paid */}
          {isAdmin && reqType === 'reembolso' && req.status === 'aprovado' && (
            <Button onClick={() => handleStatusChange('concluido')} className="gap-2">
              <CheckCircle className="w-4 h-4" /> Marcar como Pago / Concluir
            </Button>
          )}

          {/* Diária: encerrar */}
          {isAdmin && reqType === 'diaria' && req.status === 'ativa' && (
            <Button onClick={() => handleStatusChange('encerrado')} className="gap-2" variant="outline">
              <XCircle className="w-4 h-4" /> Encerrar Diária
            </Button>
          )}

          {!isOwner && !isAdmin && !isDiretoria && (
            <p className="text-sm text-muted-foreground">Nenhuma ação disponível</p>
          )}
        </CardContent>
      </Card>

      {/* Attachments (only for abastecimento) */}
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
                  <Input type="file" accept="image/*,application/pdf" onChange={e => handleUpload(e, 'hodometro')} disabled={uploading} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nota Fiscal {notaFiscal.length > 0 ? '✅' : '*'}</Label>
                  <Input type="file" accept="image/*,application/pdf" onChange={e => handleUpload(e, 'nota_fiscal')} disabled={uploading} />
                </div>
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

      {/* Reason Dialog */}
      <Dialog open={!!showReasonDialog} onOpenChange={() => setShowReasonDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Motivo</DialogTitle></DialogHeader>
          <Textarea value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="Descreva o motivo..." rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReasonDialog(null)}>Cancelar</Button>
            <Button onClick={() => showReasonDialog && handleStatusChange(showReasonDialog, actionReason)} disabled={!actionReason.trim()}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
