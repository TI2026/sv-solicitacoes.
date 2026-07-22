import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PresenceProvider } from "@/contexts/PresenceContext";
import AppLayout from "@/components/AppLayout";
import { RoleGuard } from "@/lib/roleGuard";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Lazy-loaded route pages — enables code splitting and reduces initial bundle
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const PendingRequestsPage = lazy(() => import("@/pages/PendingRequestsPage"));
const AuditLogsPage = lazy(() => import("@/pages/AuditLogsPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const PermissionsPage = lazy(() => import("@/pages/PermissionsPage"));
const SectorsPage = lazy(() => import("@/pages/SectorsPage"));
const CollaboratorsPage = lazy(() => import("@/pages/CollaboratorsPage"));
const DynamicCategoriesPage = lazy(() => import("@/pages/DynamicCategoriesPage"));
const MaintenancePage = lazy(() => import("@/pages/MaintenancePage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const DiariasListPage = lazy(() => import("@/modules/diarias/pages/DiariasListPage"));
const ReembolsosListPage = lazy(() => import("@/modules/reembolsos/pages/ReembolsosListPage"));

// Fleet module
const FleetListPage = lazy(() => import("@/modules/fleet/pages/FleetListPage"));
const FleetNewPage = lazy(() => import("@/modules/fleet/pages/FleetNewPage"));
const FleetDetailPage = lazy(() => import("@/modules/fleet/pages/FleetDetailPage"));
const VehiclesAdminPage = lazy(() => import("@/modules/fleet/pages/VehiclesAdminPage"));

// Admissions module
const AdmissionListPage = lazy(() => import("@/modules/admissions/pages/AdmissionListPage"));
const AdmissionNewPage = lazy(() => import("@/modules/admissions/pages/AdmissionNewPage"));
const AdmissionDetailPage = lazy(() => import("@/modules/admissions/pages/AdmissionDetailPage"));
const CandidateDetailPage = lazy(() => import("@/modules/admissions/pages/CandidateDetailPage"));
const PublicCandidatePage = lazy(() => import("@/modules/admissions/pages/PublicCandidatePage"));
const PublicDocumentsPage = lazy(() => import("@/modules/admissions/pages/PublicDocumentsPage"));
const PublicSignaturePage = lazy(() => import("@/modules/admissions/pages/PublicSignaturePage"));

// EPI module
const EpiCatalogPage = lazy(() => import("@/modules/epis/pages/EpiCatalogPage"));
const EpiDeliveryPage = lazy(() => import("@/modules/epis/pages/EpiDeliveryPage"));
const EpiReturnPage = lazy(() => import("@/modules/epis/pages/EpiReturnPage"));
const EpiHistoryPage = lazy(() => import("@/modules/epis/pages/EpiHistoryPage"));
const EpiPendingPage = lazy(() => import("@/modules/epis/pages/EpiPendingPage"));
const EpiDismissalReportPage = lazy(() => import("@/modules/epis/pages/EpiDismissalReportPage"));
const EpiKitRulesPage = lazy(() => import("@/modules/epis/pages/EpiKitRulesPage"));

// Purchases module — desabilitado na Sprint 13.9 (sem tabela operacional).
// Reativar na Sprint 14 quando `public.purchases` for criada.
// import { EmptyState } from "@/components/EmptyState";
// import { ShoppingCart } from "lucide-react";

// Desligamentos module
const TerminationListPage = lazy(() => import("@/modules/desligamentos/pages/TerminationListPage"));
const TerminationNewPage = lazy(() => import("@/modules/desligamentos/pages/TerminationNewPage"));
const TerminationDetailPage = lazy(() => import("@/modules/desligamentos/pages/TerminationDetailPage"));

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
  <Suspense fallback={<LoadingScreen />}>
  <Routes>
    {/* Public */}
    <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/public/candidate/:token" element={<PublicCandidatePage />} />
    <Route path="/envio-documentos" element={<PublicDocumentsPage />} />
    <Route path="/assinatura-documentos" element={<PublicSignaturePage />} />

    {/* Protected */}
    <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
    <Route path="/pendencias" element={<ProtectedRoute><PendingRequestsPage /></ProtectedRoute>} />
    <Route path="/perfil" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
    <Route path="/configuracoes" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
    <Route path="/permissoes" element={<ProtectedRoute><RoleGuard roles={['diretoria', 'administrativo']}><PermissionsPage /></RoleGuard></ProtectedRoute>} />

    {/* Admin-only routes */}
    <Route path="/auditoria" element={<ProtectedRoute><RoleGuard roles={['diretoria', 'administrativo']}><AuditLogsPage /></RoleGuard></ProtectedRoute>} />
    <Route path="/setores" element={<ProtectedRoute><RoleGuard roles={['diretoria']}><SectorsPage /></RoleGuard></ProtectedRoute>} />
    <Route path="/colaboradores" element={<ProtectedRoute><RoleGuard roles={['diretoria', 'administrativo']}><CollaboratorsPage /></RoleGuard></ProtectedRoute>} />
    <Route path="/admin/maintenance" element={<ProtectedRoute><RoleGuard roles={['diretoria']}><MaintenancePage /></RoleGuard></ProtectedRoute>} />
    
    {/* Cadastros (Dynamic Categories) */}
    <Route path="/categorias" element={<ProtectedRoute><DynamicCategoriesPage module="compras" fieldKey="category" title="Categorias" description="Gerencie a lista de categorias do módulo de compras." /></ProtectedRoute>} />
    <Route path="/fornecedores" element={<ProtectedRoute><DynamicCategoriesPage module="compras" fieldKey="supplier" title="Fornecedores" description="Gerencie a lista de fornecedores disponíveis no módulo de compras." /></ProtectedRoute>} />
    <Route path="/centros-custo" element={<ProtectedRoute><DynamicCategoriesPage module="compras" fieldKey="cost_center" title="Centros de Custo" description="Gerencie a lista de centros de custo." /></ProtectedRoute>} />

    {/* Diárias e Reembolsos */}
    <Route path="/reembolsos" element={<ProtectedRoute><ReembolsosListPage /></ProtectedRoute>} />
    <Route path="/diarias" element={<ProtectedRoute><DiariasListPage /></ProtectedRoute>} />

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

    {/* Purchases — desabilitado na Sprint 13.9. Redireciona para o Dashboard. */}
    <Route path="/purchases" element={<Navigate to="/dashboard" replace />} />
    <Route path="/purchases/new" element={<Navigate to="/dashboard" replace />} />
    <Route path="/purchases/:id" element={<Navigate to="/dashboard" replace />} />

    {/* Desligamentos */}
    <Route path="/desligamentos" element={<ProtectedRoute><TerminationListPage /></ProtectedRoute>} />
    <Route path="/desligamentos/new" element={<ProtectedRoute><TerminationNewPage /></ProtectedRoute>} />
    <Route path="/desligamentos/:id" element={<ProtectedRoute><TerminationDetailPage /></ProtectedRoute>} />

    {/* Redirects */}
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/nova-solicitacao" element={<Navigate to="/fleet/new" replace />} />
    <Route path="/solicitacao/:id" element={<Navigate to="/fleet" replace />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
  </Suspense>
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
