import { Navigate } from 'react-router-dom';

// Settings page now redirects to Profile where password change lives
export default function SettingsPage() {
  return <Navigate to="/perfil" replace />;
}
