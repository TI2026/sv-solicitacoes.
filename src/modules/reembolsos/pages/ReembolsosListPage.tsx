import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Package } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ReembolsosListPage() {
  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reembolsos</h1>
          <p className="text-muted-foreground">Gerenciamento de solicitações de reembolso.</p>
        </div>
        <Button>Nova Solicitação</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meus Reembolsos</CardTitle>
          <CardDescription>Acompanhe suas solicitações de reembolso.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Package className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">Nenhuma solicitação encontrada</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Você ainda não possui solicitações de reembolso cadastradas.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
