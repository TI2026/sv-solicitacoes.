import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types';

interface RoleGuardProps {
  roles: AppRole[];
  children: React.ReactNode;
  fallback?: string;
}

export function RoleGuard({ roles, children, fallback = '/dashboard' }: RoleGuardProps) {
  const { hasAnyRole, isMaster } = useAuth();
  // Master always passes — has full access by definition
  if (!isMaster && !hasAnyRole(roles)) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
