import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PresenceProvider } from "@/contexts/PresenceContext";
import AppLayout from "@/components/AppLayout";
import { RoleGuard } from "@/lib/roleGuard";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import AuditLogsPage from "@/pages/AuditLogsPage";
import ProfilePage from "@/pages/ProfilePage";
import SettingsPage from "@/pages/SettingsPage";
import PermissionsPage from "@/pages/PermissionsPage";
import SectorsPage from "@/pages/SectorsPage";
import MaintenancePage from "@/pages/MaintenancePage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

// Fleet module
import FleetListPage from "@/modules/fleet/pages/FleetListPage";
import FleetNewPage from "@/modules/fleet/pages/FleetNewPage";
import FleetDetailPage from "@/modules/fleet/pages/FleetDetailPage";
import VehiclesAdminPage from "@/modules/fleet/pages/VehiclesAdminPage";

// Admissions module
import AdmissionListPage from "@/modules/admissions/pages/AdmissionListPage";
import AdmissionNewPage from "@/modules/admissions/pages/AdmissionNewPage";
import AdmissionDetailPage from "@/modules/admissions/pages/AdmissionDetailPage";
import CandidateDetailPage from "@/modules/admissions/pages/CandidateDetailPage";
import PublicCandidatePage from "@/modules/admissions/pages/PublicCandidatePage";
import PublicDocumentsPage from "@/modules/admissions/pages/PublicDocumentsPage";
import PublicSignaturePage from "@/modules/admissions/pages/PublicSignaturePage";

// EPI module
import EpiCatalogPage from "@/modules/epis/pages/EpiCatalogPage";
import EpiDeliveryPage from "@/modules/epis/pages/EpiDeliveryPage";
import EpiReturnPage from "@/modules/epis/pages/EpiReturnPage";
import EpiHistoryPage from "@/modules/epis/pages/EpiHistoryPage";
import EpiPendingPage from "@/modules/epis/pages/EpiPendingPage";
import EpiDismissalReportPage from "@/modules/epis/pages/EpiDismissalReportPage";
import EpiKitRulesPage from "@/modules/epis/pages/EpiKitRulesPage";

// Purchases module
import PurchaseListPage from "@/modules/purchases/pages/PurchaseListPage";
import PurchaseFormPage from "@/modules/purchases/pages/PurchaseFormPage";
import PurchaseDetailPage from "@/modules/purchases/pages/PurchaseDetailPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
  },
});

import { ErrorBoundary } from '@/components/ErrorBoundary';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <ErrorBoundary>
      <AppLayout>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </AppLayout>
    </ErrorBoundary>
  );
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    {/* Public */}
    <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/public/candidate/:token" element={<PublicCandidatePage />} />
    <Route path="/envio-documentos" element={<PublicDocumentsPage />} />
    <Route path="/assinatura-documentos" element={<PublicSignaturePage />} />

    {/* Protected */}
    <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
    <Route path="/perfil" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
    <Route path="/configuracoes" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
    <Route path="/permissoes" element={<ProtectedRoute><RoleGuard roles={['diretoria', 'administrativo']}><PermissionsPage /></RoleGuard></ProtectedRoute>} />

    {/* Admin-only routes */}
    <Route path="/auditoria" element={<ProtectedRoute><RoleGuard roles={['diretoria', 'administrativo']}><AuditLogsPage /></RoleGuard></ProtectedRoute>} />
    <Route path="/setores" element={<ProtectedRoute><RoleGuard roles={['diretoria']}><SectorsPage /></RoleGuard></ProtectedRoute>} />
    <Route path="/admin/maintenance" element={<ProtectedRoute><RoleGuard roles={['diretoria']}><MaintenancePage /></RoleGuard></ProtectedRoute>} />

    {/* Fleet */}
    <Route path="/fleet" element={<ProtectedRoute><FleetListPage /></ProtectedRoute>} />
    <Route path="/fleet/new" element={<ProtectedRoute><FleetNewPage /></ProtectedRoute>} />
    <Route path="/fleet/vehicles-admin" element={<ProtectedRoute><RoleGuard roles={['diretoria']}><VehiclesAdminPage /></RoleGuard></ProtectedRoute>} />
    <Route path="/fleet/:id" element={<ProtectedRoute><FleetDetailPage /></ProtectedRoute>} />

    {/* Admissions */}
    <Route path="/admissions" element={<ProtectedRoute><AdmissionListPage /></ProtectedRoute>} />
    <Route path="/admissions/new" element={<ProtectedRoute><AdmissionNewPage /></ProtectedRoute>} />
    <Route path="/admissions/:id" element={<ProtectedRoute><AdmissionDetailPage /></ProtectedRoute>} />
    <Route path="/admissions/candidate/:candidateId" element={<ProtectedRoute><CandidateDetailPage /></ProtectedRoute>} />

    {/* EPIs */}
    <Route path="/epis" element={<ProtectedRoute><EpiCatalogPage /></ProtectedRoute>} />
    <Route path="/epis/catalog" element={<ProtectedRoute><EpiCatalogPage /></ProtectedRoute>} />
    <Route path="/epis/deliveries" element={<ProtectedRoute><EpiDeliveryPage /></ProtectedRoute>} />
    <Route path="/epis/returns" element={<ProtectedRoute><EpiReturnPage /></ProtectedRoute>} />
    <Route path="/epis/history" element={<ProtectedRoute><EpiHistoryPage /></ProtectedRoute>} />
    <Route path="/epis/history/:collaboratorId" element={<ProtectedRoute><EpiHistoryPage /></ProtectedRoute>} />
    <Route path="/epis/pending" element={<ProtectedRoute><EpiPendingPage /></ProtectedRoute>} />
    <Route path="/epis/dismissal-report" element={<ProtectedRoute><EpiDismissalReportPage /></ProtectedRoute>} />
    <Route path="/epis/kit-rules" element={<ProtectedRoute><EpiKitRulesPage /></ProtectedRoute>} />

    {/* Purchases */}
    <Route path="/purchases" element={<ProtectedRoute><PurchaseListPage /></ProtectedRoute>} />
    <Route path="/purchases/new" element={<ProtectedRoute><PurchaseFormPage /></ProtectedRoute>} />
    <Route path="/purchases/:id" element={<ProtectedRoute><PurchaseDetailPage /></ProtectedRoute>} />

    {/* Redirects */}
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/nova-solicitacao" element={<Navigate to="/fleet/new" replace />} />
    <Route path="/solicitacao/:id" element={<Navigate to="/fleet" replace />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PresenceProvider>
            <AppRoutes />
          </PresenceProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
