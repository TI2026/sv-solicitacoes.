import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getRequestById, getUserById, getStatusHistory, getAttachments, updateRequestStatus, addAttachment } from '@/lib/store';
import { REQUEST_TYPE_LABELS, STATUS_LABELS, STATUS_VARIANT, RequestStatus, ROLE_LABELS, AttachmentType } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Clock, CheckCircle2, XCircle, Upload, FileText, Paperclip, AlertCircle, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function StatusBadge({ status }: { status: RequestStatus }) {
  const variant = STATUS_VARIANT[status];
  const className = variant === 'approved' ? 'status-approved'
    : variant === 'rejected' ? 'status-rejected'
    : variant === 'info' ? 'status-info'
    : 'status-pending';
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>{STATUS_LABELS[status]}</span>;
}

function TimelineIcon({ status }: { status: RequestStatus }) {
  if (status === 'CONCLUIDO') return <CheckCircle2 className="w-4 h-4 text-status-approved" />;
  if (status === 'REJEITADO') return <XCircle className="w-4 h-4 text-destructive" />;
  if (status === 'DEVOLVIDO') return <AlertCircle className="w-4 h-4 text-status-pending" />;
  return <Clock className="w-4 h-4 text-status-info" />;
}

export default function RequestDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [comment, setComment] = useState('');
  const [attType, setAttType] = useState<AttachmentType>('NOTA_FISCAL');
  const [refreshKey, setRefreshKey] = useState(0);

  const request = useMemo(() => id ? getRequestById(id) : undefined, [id, refreshKey]);
  const history = useMemo(() => id ? getStatusHistory(id) : [], [id, refreshKey]);
  const attachments = useMemo(() => id ? getAttachments(id) : [], [id, refreshKey]);
  const solicitante = useMemo(() => request ? getUserById(request.solicitanteId) : undefined, [request]);

  if (!request || !user) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Solicitação não encontrada</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/dashboard')}>Voltar</Button>
      </div>
    );
  }

  const handleStatusChange = (newStatus: RequestStatus) => {
    updateRequestStatus(request.id, newStatus, user.id, comment || undefined);
    setComment('');
    setRefreshKey(k => k + 1);
    toast({ title: 'Status atualizado', description: `Status alterado para: ${STATUS_LABELS[newStatus]}` });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Mock file upload - store filename
    addAttachment({
      solicitacaoId: request.id,
      tipoDocumento: attType,
      url: URL.createObjectURL(file),
      fileName: file.name,
    });
    setRefreshKey(k => k + 1);
    toast({ title: 'Anexo adicionado', description: file.name });
    e.target.value = '';
  };

  // Determine available actions based on role and status
  const actions: { label: string; status: RequestStatus; variant?: 'default' | 'destructive' | 'outline' }[] = [];
  const s = request.status;

  if (user.role === 'ADMINISTRATIVO' || user.role === 'ADMIN') {
    if (s === 'PENDENTE_CONFERENCIA_INICIAL') {
      actions.push({ label: 'Aprovar Conferência Inicial', status: 'AGUARDANDO_APROVACAO_DIRETORIA' });
      actions.push({ label: 'Devolver', status: 'DEVOLVIDO', variant: 'outline' });
      actions.push({ label: 'Rejeitar', status: 'REJEITADO', variant: 'destructive' });
    }
    if (s === 'PENDENTE_CONFERENCIA_FINAL') {
      actions.push({ label: 'Concluir', status: 'CONCLUIDO' });
      actions.push({ label: 'Devolver', status: 'DEVOLVIDO', variant: 'outline' });
    }
  }

  if (user.role === 'DIRETOR' || user.role === 'ADMIN') {
    if (s === 'AGUARDANDO_APROVACAO_DIRETORIA') {
      actions.push({ label: 'Aprovar', status: 'AGUARDANDO_ANEXOS' });
      actions.push({ label: 'Rejeitar', status: 'REJEITADO', variant: 'destructive' });
    }
  }

  if (user.role === 'COLABORADOR' && user.id === request.solicitanteId) {
    if (s === 'DEVOLVIDO') {
      actions.push({ label: 'Reenviar', status: 'PENDENTE_CONFERENCIA_INICIAL' });
    }
  }

  const canUpload = s === 'AGUARDANDO_ANEXOS' && (user.id === request.solicitanteId || user.role === 'ADMIN');

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <Button variant="ghost" className="gap-2" onClick={() => navigate('/dashboard')}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-bold text-foreground">{REQUEST_TYPE_LABELS[request.type]}</h2>
                <StatusBadge status={request.status} />
              </div>
              <p className="text-sm text-muted-foreground">#{request.id} • Criado em {new Date(request.dataSolicitacao).toLocaleDateString('pt-BR')}</p>
            </div>
            <span className="text-2xl font-bold text-foreground">{request.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Solicitante</p>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-3 h-3 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">{solicitante?.name}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Categoria</p>
              <p className="text-sm font-medium text-foreground">{request.category}</p>
            </div>
            {request.veiculoPlaca && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Placa / KM</p>
                <p className="text-sm font-medium text-foreground">{request.veiculoPlaca} • {request.kmAtual?.toLocaleString()} km</p>
              </div>
            )}
            {request.descricao && (
              <div className="col-span-full">
                <p className="text-xs text-muted-foreground mb-1">Descrição</p>
                <p className="text-sm text-foreground">{request.descricao}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      {actions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Comentário (opcional)</Label>
              <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Adicione um comentário..." rows={2} />
            </div>
            <div className="flex flex-wrap gap-2">
              {actions.map(a => (
                <Button key={a.status} variant={a.variant || 'default'} onClick={() => handleStatusChange(a.status)} size="sm">
                  {a.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload */}
      {canUpload && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Enviar Anexos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={attType} onValueChange={v => setAttType(v as AttachmentType)}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOTA_FISCAL">Nota Fiscal</SelectItem>
                  <SelectItem value="RECIBO">Recibo</SelectItem>
                  <SelectItem value="FOTO_PAINEL">Foto Painel</SelectItem>
                  <SelectItem value="OUTRO">Outro</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex-1">
                <div className="flex items-center gap-2 px-4 py-2 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted transition-colors text-sm text-muted-foreground">
                  <Upload className="w-4 h-4" /> Clique para enviar arquivo
                </div>
                <input type="file" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            {canUpload && (
              <Button className="mt-3" size="sm" onClick={() => handleStatusChange('PENDENTE_CONFERENCIA_FINAL')}>
                Enviar para Conferência Final
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Attachments */}
      {attachments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Anexos ({attachments.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {attachments.map(att => (
                <div key={att.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{att.fileName}</p>
                    <p className="text-xs text-muted-foreground">{att.tipoDocumento} • {new Date(att.dataUpload).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {history.map((h, i) => {
              const responsible = getUserById(h.usuarioResponsavel);
              return (
                <div key={h.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <TimelineIcon status={h.statusNovo} />
                    </div>
                    {i < history.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium text-foreground">{STATUS_LABELS[h.statusNovo]}</p>
                    <p className="text-xs text-muted-foreground">
                      {responsible?.name} • {new Date(h.data).toLocaleString('pt-BR')}
                    </p>
                    {h.comentario && <p className="text-sm text-muted-foreground mt-1">{h.comentario}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
