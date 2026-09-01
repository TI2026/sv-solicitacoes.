import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfigurationErrorScreenProps {
  missingVariables: string[];
}

export function ConfigurationErrorScreen({ missingVariables }: ConfigurationErrorScreenProps) {
  return (
    <main className="min-h-screen bg-background p-6 flex items-center justify-center">
      <section className="w-full max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm" role="alert">
        <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" aria-hidden="true" />
        <h1 className="mb-2 text-xl font-bold text-foreground">Aplicação temporariamente indisponível</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          A conexão pública com o Supabase não foi configurada neste ambiente de publicação.
          Nenhum dado foi enviado.
        </p>
        <div className="mb-6 rounded-md border bg-muted/50 p-3 text-left">
          <p className="mb-1 text-xs font-medium text-foreground">Configuração ausente:</p>
          <ul className="list-disc pl-5 font-mono text-xs text-muted-foreground">
            {missingVariables.map((variable) => <li key={variable}>{variable}</li>)}
          </ul>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Solicite ao administrador a republicação do sistema após corrigir o ambiente.
        </p>
        <Button type="button" variant="outline" className="w-full gap-2" onClick={() => window.location.reload()}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Tentar novamente
        </Button>
      </section>
    </main>
  );
}
