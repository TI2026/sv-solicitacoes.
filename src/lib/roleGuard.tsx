import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types';
import { Loader2 } from 'lucide-react';

interface RoleGuardProps {
  roles: AppRole[];
  children: React.ReactNode;
  fallback?: string;
}

export function RoleGuard({ roles, children, fallback = '/dashboard' }: RoleGuardProps) {
  const { hasAnyRole, isMaster, loading } = useAuth();

  // Aguarda o AuthContext terminar de carregar antes de decidir
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isMaster && !hasAnyRole(roles)) {
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}

