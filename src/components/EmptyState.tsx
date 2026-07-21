import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <Card className={cn('border-dashed', className)}>
      <CardContent className="flex flex-col items-center justify-center py-14 text-center gap-3">
        <div className="rounded-full bg-muted p-3">
          <Icon className="w-8 h-8 text-muted-foreground/70" />
        </div>
        <div className="space-y-1">
          <p className="font-medium text-foreground">{title}</p>
          {description && <p className="text-sm text-muted-foreground max-w-md">{description}</p>}
        </div>
        {action && <div className="mt-2">{action}</div>}
      </CardContent>
    </Card>
  );
}

export default EmptyState;