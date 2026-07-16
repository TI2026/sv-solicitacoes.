/**
 * QuickAccessWidget.tsx
 *
 * CAMADA: Component
 *
 * Responsabilidade: renderizar atalhos de navegação rápida para
 * os módulos ATIVOS do sistema.
 *
 * Regra: NENHUM placeholder. Apenas módulos que existem em produção.
 * Quando Compras (Sprint 8), EPIs (Sprint 10) ou outros forem lançados,
 * adicionar aqui os seus cards.
 *
 * Regras obrigatórias:
 *  - NUNCA acessar Supabase diretamente.
 *  - Este componente é puramente de navegação — sem hooks de dados.
 *
 * Padrão: Component (este) → useNavigate → Router
 */

import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Zap, Fuel, Receipt, CalendarDays, UserPlus, Plus, List } from 'lucide-react';

interface QuickModule {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  newRoute: string;
  listRoute: string;
  /** Papéis que podem criar novas solicitações. undefined = todos. */
  show: boolean;
}

interface Props {
  canViewAdmissions: boolean;
}

export function QuickAccessWidget({ canViewAdmissions }: Props) {
  const navigate = useNavigate();

  const modules: QuickModule[] = [
    {
      key: 'abastecimento',
      label: 'Abastecimento',
      icon: Fuel,
      newRoute: '/fleet/new?type=abastecimento',
      listRoute: '/fleet?filter=minhas',
      show: true,
    },
    {
      key: 'reembolso',
      label: 'Reembolso',
      icon: Receipt,
      newRoute: '/fleet/new?type=reembolso',
      listRoute: '/fleet?filter=minhas',
      show: true,
    },
    {
      key: 'diaria',
      label: 'Diária',
      icon: CalendarDays,
      newRoute: '/fleet/new?type=diaria',
      listRoute: '/fleet?filter=minhas',
      show: true,
    },
    {
      key: 'admissao',
      label: 'Admissões',
      icon: UserPlus,
      newRoute: '/admissions/new',
      listRoute: '/admissions',
      show: canViewAdmissions,
    },
  ].filter(m => m.show);

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-muted-foreground shrink-0" />
          <h2 className="text-base font-bold text-foreground">Acesso Rápido</h2>
        </div>

        {/* Grid de módulos */}
        <div className="grid grid-cols-1 gap-2">
          {modules.map(mod => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.key}
                className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5 bg-background"
              >
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground flex-1">{mod.label}</span>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 px-2"
                    onClick={() => navigate(mod.listRoute)}
                    title={`Ver lista de ${mod.label}`}
                  >
                    <List className="w-3 h-3" />
                    Lista
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 text-xs gap-1 px-2"
                    onClick={() => navigate(mod.newRoute)}
                    title={`Nova solicitação de ${mod.label}`}
                  >
                    <Plus className="w-3 h-3" />
                    Nova
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
