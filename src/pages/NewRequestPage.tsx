import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function NewRequestPage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <Button variant="ghost" className="gap-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Nova Solicitação</CardTitle>
          <CardDescription>Módulo de abastecimento/reembolso em construção</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            O formulário de solicitações será implementado na próxima etapa, com as tabelas de solicitações no banco de dados.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
