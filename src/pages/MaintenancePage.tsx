import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2, Trash2, Eye, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type PurgeScope = 'SOLICITACOES' | 'ADMISSOES' | 'ALL_TEST';

export default function MaintenancePage() {
  const { hasRole, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<PurgeScope>('ALL_TEST');
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!hasAnyRole(['diretoria', 'administrativo'])) return <Navigate to="/dashboard" replace />;

  const handlePreview = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc('admin_purge_test_data', {
        _scope: scope,
        _confirm: false,
      });
      if (error) throw error;
      const res = data as any;
      if (res?.error) { toast({ title: 'Erro', description: res.error, variant: 'destructive' }); return; }
      setPreview(res.counts || {});
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setShowConfirm(false);
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_purge_test_data', {
        _scope: scope,
        _confirm: true,
      });
      if (error) throw error;
      const res = data as any;
      if (res?.error) { toast({ title: 'Erro', description: res.error, variant: 'destructive' }); return; }
      setResult(res.counts || {});
      setPreview(null);
      toast({ title: 'Limpeza concluída', description: 'Dados de teste removidos com sucesso.' });

      // Invalidate specific queries so dashboard/lists refresh
      await queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const totalCount = (counts: Record<string, number>) =>
    Object.values(counts).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);

  const labelMap: Record<string, string> = {
    fuel_attachments: 'Anexos de abastecimento',
    fuel_reviews: 'Revisões de abastecimento',
    status_history_fleet: 'Histórico (Solicitações)',
    notifications_fleet: 'Notificações (Solicitações)',
    fuel_requests: 'Solicitações',
    document_reviews: 'Revisões de documentos',
    candidate_documents: 'Documentos de candidatos',
    medical_exams: 'Exames médicos',
    system_registrations: 'Registros de sistema',
    public_tokens: 'Tokens públicos',
    admission_files: 'Arquivos de admissão',
    admission_public_links: 'Links públicos',
    candidates: 'Candidatos',
    status_history_admissions: 'Histórico (Admissões)',
    notifications_admissions: 'Notificações (Admissões)',
    admission_requests: 'Processos de admissão',
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Manutenção — Limpeza de Dados
          </CardTitle>
          <CardDescription>
            Remove dados de teste (solicitações e/ou admissões). Estrutura, funções e design permanecem intactos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Escopo da limpeza</label>
            <Select value={scope} onValueChange={v => { setScope(v as PurgeScope); setPreview(null); setResult(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SOLICITACOES">Somente Solicitações</SelectItem>
                <SelectItem value="ADMISSOES">Somente Admissões</SelectItem>
                <SelectItem value="ALL_TEST">Tudo (Solicitações + Admissões)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handlePreview} disabled={loading} variant="outline" className="gap-2 w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Visualizar (Preview)
          </Button>

          {preview && (
            <div className="border border-border rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground">Itens que serão removidos:</p>
              {Object.entries(preview).map(([key, count]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{labelMap[key] || key}</span>
                  <span className="font-mono font-semibold text-foreground">{count}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold border-t border-border pt-2 mt-2">
                <span>Total</span>
                <span>{totalCount(preview)}</span>
              </div>

              {totalCount(preview) > 0 ? (
                <Button onClick={() => setShowConfirm(true)} disabled={loading} variant="destructive" className="gap-2 w-full mt-3">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Confirmar Limpeza
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground text-center mt-2">Nenhum dado encontrado para limpar.</p>
              )}
            </div>
          )}

          {result && (
            <div className="border border-border rounded-lg p-4 space-y-2 bg-primary/5">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary" /> Limpeza concluída
              </p>
              {Object.entries(result).map(([key, count]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{labelMap[key] || key}</span>
                  <span className="font-mono text-foreground">{count} removido(s)</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar limpeza de dados</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga SOMENTE dados (linhas) de Solicitações e Admissões. Não remove funções, tabelas, colunas ou design. A ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirmar exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
