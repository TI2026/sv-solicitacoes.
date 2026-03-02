import { getStatusVariant } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  label: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const variant = getStatusVariant(status);
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      variant === 'approved' && 'status-approved',
      variant === 'rejected' && 'status-rejected',
      variant === 'info' && 'status-info',
      variant === 'pending' && 'status-pending',
      className,
    )}>
      {label}
    </span>
  );
}
