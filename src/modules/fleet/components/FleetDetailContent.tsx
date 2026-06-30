import { useNavigate } from 'react-router-dom';
import { useFleetDetail } from '../contexts/FleetDetailContext';
import { FleetPaymentBlock } from './FleetPaymentBlock';
import { FleetApprovalAction } from './FleetApprovalAction';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/StatusBadge';
import { DiariaProgressBar } from './DiariaProgressBar';
import { FleetTimeline } from './FleetTimeline';
import { ApprovalStatusBlock } from '@/components/ApprovalStatusBlock';
import { ApprovalFlowViewer } from './ApprovalFlowViewer';
import { MaskedPix } from '@/components/MaskedPix';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Loader2, Send, DollarSign, Calendar, User, Car, Clock,
  Receipt, FileText, CreditCard, AlertTriangle, FileImage, Trash2 
} from 'lucide-react';
import { FUEL_STATUS_LABELS, REQUEST_TYPE_LABELS } from '@/lib/constants';
import { useDynamicCategories } from '@/hooks/useDynamicCategories';

function ReembolsoDetails({ req }: { req: any }) {
  const pixKeyType = req.pix_key_type;
  const pixLabel = pixKeyType === 'celular' ? 'Celular' : pixKeyType === 'cpf' ? 'CPF' : 'Chave';
  return (
    <div className="text-sm text-muted-foreground border-t border-border pt-2 space-y-1">
      {req.categoria && <p>Categoria: {req.categoria}</p>}
      {req.payment_method === 'pix' && req.pix_key && (
        <div className="flex items-center gap-1">Pix ({pixLabel}): <MaskedPix value={req.pix_key} className="inline-flex ml-1" /></div>
      )}
      {req.payment_method === 'conta_bancaria' && (
        <>
          {req.bank_name && <p>Banco: {req.bank_name}</p>}
          {req.bank_agency && <p>Agência: <span className="font-mono tracking-tight">{req.bank_agency}</span></p>}
          {req.bank_account && <p>Conta: <span className="font-mono tracking-tight">{req.bank_account}</span></p>}
        </>
      )}
      {req.person_name && <p>Beneficiário: {req.person_name}</p>}
      {req.person_cpf && <p>CPF: <span className="font-mono tracking-tight">{req.person_cpf}</span></p>}
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
      {req.person_cpf && <p>CPF: <span className="font-mono tracking-tight">{req.person_cpf}</span></p>}
      {req.payment_method === 'pix' && req.pix_key && (
        <div className="flex items-center gap-1">Pix: <MaskedPix value={req.pix_key} className="inline-flex ml-1" /></div>
      )}
      {req.payment_method === 'conta_bancaria' && (
        <>
          {req.bank_name && <p>Banco: {req.bank_name}</p>}
          {req.bank_agency && <p>Agência: <span className="font-mono tracking-tight">{req.bank_agency}</span></p>}
          {req.bank_account && <p>Conta: <span className="font-mono tracking-tight">{req.bank_account}</span></p>}
        </>
      )}
      {req.motivo && <p>Motivo: {req.motivo}</p>}
    </div>
  );
}

export function FleetDetailContent() {
  const navigate = useNavigate();
  const {
    id, req, isLoading, attachments, approvalRequest, allApprovalCycles, previousCycles,
    isOwner, isAdmin, isMaster, reqType, vehicle, hasActiveFlow,
    canSendToReview, isPending, canMasterDelete, canUpload, hodometro, notaFiscal,
    uploading, showDeleteDialog, setShowDeleteDialog, deleteReason, setDeleteReason,
    reviewKmReal, setReviewKmReal, reviewKmOk, setReviewKmOk, reviewNfReal, setReviewNfReal,
    reviewNfOk, setReviewNfOk, reviewDivergenceReason, setReviewDivergenceReason,
    previewUrl, setPreviewUrl, previewType, setPreviewType, previewTitle, setPreviewTitle,
    handleStatusChange, handleUpload, openInlinePreview, softDelete
  } = useFleetDetail();

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!req) return <p className="text-center py-12 text-muted-foreground">Solicitação não encontrada</p>;

  const handleReviewConfirm = () => {
    if (reviewKmOk && reviewNfOk) {
      handleStatusChange('aprovado', 'KM e NF conferidos.');
    } else {
      let parts = [];
      if (!reviewKmOk) parts.push(`KM real: ${reviewKmReal}`);
      if (!reviewNfOk) parts.push(`NF real: R$ ${reviewNfReal}`);
      const notes = `${parts.join(' | ')}. Justificativa: ${reviewDivergenceReason}`;
      handleStatusChange('retornado', notes);
    }
  };

  const kmDeclared = Number((req as any).km || 0);
  const valorDeclared = Number(req.valor || 0);
  const kmRealNum = Number(reviewKmReal || kmDeclared);
  const nfRealNum = Number(reviewNfReal || valorDeclared);
  const kmDivergent = !reviewKmOk && reviewKmReal !== '' && kmRealNum !== kmDeclared;
  const nfDivergent = !reviewNfOk && reviewNfReal !== '' && nfRealNum !== valorDeclared;
  const hasDivergence = kmDivergent || nfDivergent;
  const justificativaOk = !hasDivergence || reviewDivergenceReason.trim().length >= 10;

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <Button variant="ghost" className="gap-2" onClick={() => navigate('/fleet')}>
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        {canMasterDelete && (
          <Button variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 gap-2" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="w-4 h-4" /> Excluir
          </Button>
        )}
      </div>

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
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Reenviar solicitação
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
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

            {reqType === 'abastecimento' && ((req as any).placa || (req as any).km || (req as any).motivo) && (
              <div className="border-t border-border pt-3 mt-1 space-y-2">
                {(req as any).placa && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Car className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Veículo</p>
                      <p className="text-3xl sm:text-4xl font-extrabold font-mono tracking-widest uppercase text-foreground leading-tight">
                        {String((req as any).placa).toUpperCase()}
                      </p>
                      {vehicle?.modelo && <p className="text-sm font-medium text-foreground/80 truncate">{vehicle.modelo}</p>}
                    </div>
                    {(req as any).km && (
                      <div className="text-right shrink-0">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">KM</p>
                        <p className="text-lg font-bold text-foreground font-mono tracking-tight">
                          {Number((req as any).km).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {(req as any).motivo && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span>📝</span><span>{(req as any).motivo}</span>
                  </p>
                )}
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

        {reqType === 'diaria' && (
          <Card className="lg:col-span-3 order-first lg:order-none">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Progresso da Diária
              </h3>
              <DiariaProgressBar requestId={id!} currentStatus={req.status} />
            </CardContent>
          </Card>
        )}

        {/* Actions Sidebar */}
        <Card className="lg:sticky lg:top-4 self-start">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Ações</h3>

            {isOwner && req.status === 'rascunho' && (
              <Button onClick={() => handleStatusChange('enviado')} disabled={isPending} className="gap-2 w-full sm:w-auto">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar Solicitação
              </Button>
            )}

            {isOwner && req.status === 'retornado' && (
              <Button onClick={() => handleStatusChange('enviado')} disabled={isPending} className="gap-2 w-full sm:w-auto">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Reenviar
              </Button>
            )}

            {isAdmin && reqType === 'diaria' && req.status === 'enviado' && (
              <Button onClick={() => handleStatusChange('em_revisao')} disabled={isPending} className="gap-2">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />} Analisar Diária
              </Button>
            )}

            {isAdmin && reqType === 'abastecimento' && req.status === 'aprovado' && (
              <Button onClick={() => handleStatusChange('aguardando_fotos')} disabled={isPending} className="gap-2">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />} Confirmar Recarga
              </Button>
            )}

            {canSendToReview && (
              <Button onClick={() => handleStatusChange('em_revisao_admin')} disabled={isPending} className="gap-2">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar para Revisão
              </Button>
            )}

            <FleetApprovalAction />
            <FleetPaymentBlock />

          </CardContent>
        </Card>

        {/* Final review block for Admin (abastecimento) */}
        {isAdmin && reqType === 'abastecimento' && req.status === 'em_revisao_admin' && (
          <Card className="lg:col-span-3 border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-amber-800 dark:text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Revisão de Abastecimento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>KM bate com a foto? (Declarado: {kmDeclared})</Label>
                    <div className="flex gap-2">
                      <Button size="sm" variant={reviewKmOk ? 'default' : 'outline'} onClick={() => setReviewKmOk(true)}>Sim</Button>
                      <Button size="sm" variant={!reviewKmOk ? 'destructive' : 'outline'} onClick={() => setReviewKmOk(false)}>Não</Button>
                    </div>
                  </div>
                  {!reviewKmOk && (
                    <Input type="number" placeholder="KM real da foto..." value={reviewKmReal} onChange={e => setReviewKmReal(e.target.value)} />
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Valor NF bate com declarado? (R$ {valorDeclared})</Label>
                    <div className="flex gap-2">
                      <Button size="sm" variant={reviewNfOk ? 'default' : 'outline'} onClick={() => setReviewNfOk(true)}>Sim</Button>
                      <Button size="sm" variant={!reviewNfOk ? 'destructive' : 'outline'} onClick={() => setReviewNfOk(false)}>Não</Button>
                    </div>
                  </div>
                  {!reviewNfOk && (
                    <Input type="number" step="0.01" placeholder="Valor real da NF..." value={reviewNfReal} onChange={e => setReviewNfReal(e.target.value)} />
                  )}
                </div>
              </div>

              {hasDivergence && (
                <div className="space-y-2 mt-4 p-3 bg-white dark:bg-background rounded-md border border-amber-200 dark:border-amber-900">
                  <Label className="text-amber-800 dark:text-amber-400 flex gap-1">
                    <AlertTriangle className="w-4 h-4" /> Justificativa (obrigatória para divergências)
                  </Label>
                  <Textarea placeholder="Explique por que as fotos não batem com o declarado..." value={reviewDivergenceReason} onChange={e => setReviewDivergenceReason(e.target.value)} />
                  {!justificativaOk && <p className="text-xs text-red-500">Mínimo de 10 caracteres na justificativa.</p>}
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-amber-200 dark:border-amber-900/50 mt-4">
                <Button onClick={handleReviewConfirm} disabled={isPending || !justificativaOk} className={hasDivergence ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}>
                  {hasDivergence ? 'Registrar Divergência e Devolver' : 'Confirmar Tudo OK e Finalizar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Approval Flow Display */}
        {approvalRequest && (
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">Cadeia de Aprovação Atual</CardTitle></CardHeader>
            <CardContent><ApprovalFlowViewer approvalRequestId={approvalRequest.id} /></CardContent>
          </Card>
        )}

        {/* Previous Cycles */}
        {previousCycles.map((cycle: any, idx: number) => (
          <Card key={cycle.id} className="lg:col-span-3 opacity-70">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Histórico de Aprovação #{previousCycles.length - idx}</CardTitle></CardHeader>
            <CardContent><ApprovalFlowViewer approvalRequestId={cycle.id} /></CardContent>
          </Card>
        ))}

        {/* Attachments Section */}
        {reqType === 'abastecimento' && (canUpload || (attachments && attachments.length > 0)) && (
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><FileImage className="w-5 h-5" /> Comprovantes Obrigatórios</CardTitle>
                {canUpload && (
                  <div className="flex flex-wrap gap-2">
                    <div className="relative">
                      <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" onChange={e => handleUpload(e, 'hodometro')} disabled={uploading} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                      <Button variant="outline" size="sm" disabled={uploading} className="gap-2 pointer-events-none relative z-0">
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileImage className="w-4 h-4" />} Enviar Hodômetro
                      </Button>
                    </div>
                    <div className="relative">
                      <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" onChange={e => handleUpload(e, 'nota_fiscal')} disabled={uploading} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                      <Button variant="outline" size="sm" disabled={uploading} className="gap-2 pointer-events-none relative z-0">
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Enviar Nota Fiscal
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2"><Car className="w-4 h-4" /> Hodômetro</h4>
                  {hodometro.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {hodometro.map((att: any) => (
                        <div key={att.id} className="relative group cursor-pointer overflow-hidden rounded-md border" onClick={() => openInlinePreview(att.file_path, 'Hodômetro')}>
                          <img src={`${supabase.storage.from('fleet').getPublicUrl(att.file_path).data.publicUrl}?t=${Date.now()}`} alt="Hodômetro" className="object-cover w-full h-24 hover:scale-105 transition-transform" />
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground italic p-4 bg-muted/30 rounded-md border border-dashed">Nenhuma foto enviada.</p>}
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2"><Receipt className="w-4 h-4" /> Nota Fiscal / Cupom</h4>
                  {notaFiscal.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {notaFiscal.map((att: any) => (
                        <div key={att.id} className="relative group cursor-pointer overflow-hidden rounded-md border" onClick={() => openInlinePreview(att.file_path, 'Nota Fiscal')}>
                          {/\.pdf$/i.test(att.file_path) ? (
                            <div className="w-full h-24 flex flex-col items-center justify-center bg-muted/30 hover:bg-muted/50 transition-colors">
                              <FileText className="w-8 h-8 text-primary/60 mb-1" /><span className="text-xs font-medium">Ver PDF</span>
                            </div>
                          ) : (
                            <img src={`${supabase.storage.from('fleet').getPublicUrl(att.file_path).data.publicUrl}?t=${Date.now()}`} alt="NF" className="object-cover w-full h-24 hover:scale-105 transition-transform" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground italic p-4 bg-muted/30 rounded-md border border-dashed">Nenhum cupom enviado.</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timeline */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">Histórico de Movimentações</CardTitle></CardHeader>
          <CardContent><FleetTimeline requestId={id!} req={req} approvalRequest={approvalRequest} /></CardContent>
        </Card>
      </div>

      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-background">
          <DialogHeader className="p-4 border-b shrink-0"><DialogTitle>{previewTitle}</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-auto bg-muted/10 p-4 flex items-center justify-center">
            {previewType === 'image' && previewUrl && <img src={previewUrl} alt="Preview" className="max-w-full max-h-full object-contain rounded-md shadow-sm" />}
            {previewType === 'pdf' && previewUrl && <iframe src={`${previewUrl}#toolbar=0`} className="w-full h-full rounded-md shadow-sm border-0" />}
          </div>
          <DialogFooter className="p-4 border-t shrink-0">
            <Button variant="outline" onClick={() => { if (previewUrl) window.open(previewUrl, '_blank'); }}>Abrir em nova aba</Button>
            <Button onClick={() => { setPreviewUrl(null); setPreviewType(null); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><AlertTriangle className="w-5 h-5" /> Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Alert variant="destructive">
              <AlertDescription>Esta solicitação será desativada e ocultada de todas as visões padrão do sistema.</AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>Motivo da exclusão (obrigatório para auditoria)</Label>
              <Textarea placeholder="Descreva por que esta solicitação está sendo excluída..." value={deleteReason} onChange={e => setDeleteReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isPending}>Cancelar</Button>
            <Button variant="destructive" onClick={() => {
                softDelete.mutateAsync({ id: id!, reason: deleteReason }).then(() => {
                  toast({ title: 'Excluída com sucesso' }); navigate('/fleet');
                });
              }} disabled={isPending || deleteReason.trim().length < 5}>Excluir Solicitação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
