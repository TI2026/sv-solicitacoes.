import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList, Construction } from 'lucide-react';

export default function ReportsPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" /> Relatórios
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Exportações consolidadas e relatórios gerenciais do sistema.
        </p>
      </div>

      <Card className="border-dashed">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto bg-muted w-16 h-16 rounded-full flex items-center justify-center mb-4">
            <Construction className="w-8 h-8 text-muted-foreground" />
          </div>
          <CardTitle>Módulo em Construção</CardTitle>
          <CardDescription>
            A área de relatórios centralizados está sendo desenvolvida. Em breve você poderá exportar consolidados de todos os módulos por aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center pb-8">
          <p className="text-sm text-muted-foreground">
            Por enquanto, utilize os botões de exportação individuais dentro de cada módulo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
