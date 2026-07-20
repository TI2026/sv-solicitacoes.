import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Construction } from 'lucide-react';
import { useLocation } from 'react-router-dom';

export default function ConstructionPage() {
  const location = useLocation();
  const moduleName = location.pathname.split('/')[1] || 'Módulo';
  
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground capitalize">
          {moduleName.replace('-', ' ')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Este módulo está em desenvolvimento.
        </p>
      </div>

      <Card className="border-dashed">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto bg-muted w-16 h-16 rounded-full flex items-center justify-center mb-4">
            <Construction className="w-8 h-8 text-muted-foreground" />
          </div>
          <CardTitle>Módulo em Construção</CardTitle>
          <CardDescription>
            A área de {moduleName.replace('-', ' ')} está sendo desenvolvida. Em breve você poderá acessá-la por aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center pb-8">
          <p className="text-sm text-muted-foreground">
            Agradecemos a paciência durante a construção do ERP.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
