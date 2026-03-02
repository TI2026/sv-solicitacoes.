import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types';

interface RoleGuardProps {
  roles: AppRole[];
  children: React.ReactNode;
  fallback?: string;
}

export function RoleGuard({ roles, children, fallback = '/dashboard' }: RoleGuardProps) {
  const { hasAnyRole } = useAuth();
  if (!hasAnyRole(roles)) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
