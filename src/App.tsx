import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PresenceProvider } from "@/contexts/PresenceContext";
import AppLayout from "@/components/AppLayout";
import { PermissionGuard, RoleGuard } from "@/lib/roleGuard";
import { Suspense } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { Loader2 } from "lucide-react";
import { missingSupabaseEnvironment, supabase } from "@/integrations/supabase/client";
import { isFleetBusinessModule, requestDetailRoute } from "@/modules/fleet/requestRoutes";
import { ConfigurationErrorScreen } from "@/components/ConfigurationErrorScreen";

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

// Purchases module (Sprint 14 — reativado com tabela operacional `public.purchases`)
const PurchaseListPage = lazy(() => import("@/modules/purchases/pages/PurchaseListPage"));
const PurchaseFormPage = lazy(() => import("@/modules/purchases/pages/PurchaseFormPage"));
const PurchaseDetailPage = lazy(() => import("@/modules/purchases/pages/PurchaseDetailPage"));

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

function LegacyRequestDetailRedirect() {
  const { id } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ['legacy-fleet-route', id],
    queryFn: async () => {
      const { data: request, error } = await supabase
        .from('fuel_requests')
        .select('type')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return request;
    },
    enabled: !!id,
  });
  if (isLoading) return <LoadingScreen />;
  if (!id || !isFleetBusinessModule(data?.type)) return <Navigate to="/not-found" replace />;
  return <Navigate to={requestDetailRoute(data.type, id)} replace />;
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
    <Route path="/reembolsos" element={<ProtectedRoute><PermissionGuard moduleCode="reembolso" fallbackAuthenticated><ReembolsosListPage /></PermissionGuard></ProtectedRoute>} />
    <Route path="/reembolsos/new" element={<ProtectedRoute><PermissionGuard moduleCode="reembolso" fallbackAuthenticated><FleetNewPage requestType="reembolso" /></PermissionGuard></ProtectedRoute>} />
    <Route path="/reembolsos/:id" element={<ProtectedRoute><PermissionGuard moduleCode="reembolso" fallbackAuthenticated><FleetDetailPage requestType="reembolso" /></PermissionGuard></ProtectedRoute>} />
    <Route path="/diarias" element={<ProtectedRoute><PermissionGuard moduleCode="diaria" fallbackAuthenticated><DiariasListPage /></PermissionGuard></ProtectedRoute>} />
    <Route path="/diarias/new" element={<ProtectedRoute><PermissionGuard moduleCode="diaria" fallbackAuthenticated><FleetNewPage requestType="diaria" /></PermissionGuard></ProtectedRoute>} />
    <Route path="/diarias/:id/edit" element={<ProtectedRoute><PermissionGuard moduleCode="diaria" fallbackAuthenticated><FleetNewPage requestType="diaria" /></PermissionGuard></ProtectedRoute>} />
    <Route path="/diarias/:id" element={<ProtectedRoute><PermissionGuard moduleCode="diaria" fallbackAuthenticated><FleetDetailPage requestType="diaria" /></PermissionGuard></ProtectedRoute>} />

    {/* Abastecimento */}
    <Route path="/abastecimento" element={<ProtectedRoute><PermissionGuard moduleCode="abastecimento" fallbackAuthenticated><FleetListPage requestType="abastecimento" /></PermissionGuard></ProtectedRoute>} />
    <Route path="/abastecimento/new" element={<ProtectedRoute><PermissionGuard moduleCode="abastecimento" fallbackAuthenticated><FleetNewPage /></PermissionGuard></ProtectedRoute>} />
    <Route path="/abastecimento/vehicles-admin" element={<ProtectedRoute><RoleGuard roles={['diretoria']}><VehiclesAdminPage /></RoleGuard></ProtectedRoute>} />
    <Route path="/abastecimento/:id" element={<ProtectedRoute><PermissionGuard moduleCode="abastecimento" fallbackAuthenticated><FleetDetailPage requestType="abastecimento" /></PermissionGuard></ProtectedRoute>} />

    {/* Admissions */}
    <Route path="/admissions" element={<ProtectedRoute><PermissionGuard moduleCode="admissoes" fallbackRoles={['diretoria', 'rh', 'administrativo']}><AdmissionListPage /></PermissionGuard></ProtectedRoute>} />
    <Route path="/admissions/new" element={<ProtectedRoute><PermissionGuard moduleCode="admissoes" fallbackRoles={['diretoria', 'rh', 'administrativo']}><AdmissionNewPage /></PermissionGuard></ProtectedRoute>} />
    <Route path="/admissions/:id" element={<ProtectedRoute><PermissionGuard moduleCode="admissoes" fallbackRoles={['diretoria', 'rh', 'administrativo']}><AdmissionDetailPage /></PermissionGuard></ProtectedRoute>} />
    <Route path="/admissions/candidate/:candidateId" element={<ProtectedRoute><PermissionGuard moduleCode="admissoes" fallbackRoles={['diretoria', 'rh', 'administrativo']}><CandidateDetailPage /></PermissionGuard></ProtectedRoute>} />

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

    {/* Purchases (Sprint 14) */}
    <Route path="/purchases" element={<ProtectedRoute><PermissionGuard moduleCode="compras" fallbackAuthenticated><PurchaseListPage /></PermissionGuard></ProtectedRoute>} />
    <Route path="/purchases/new" element={<ProtectedRoute><PermissionGuard moduleCode="compras" fallbackAuthenticated><PurchaseFormPage /></PermissionGuard></ProtectedRoute>} />
    <Route path="/purchases/:id" element={<ProtectedRoute><PermissionGuard moduleCode="compras" fallbackAuthenticated><PurchaseDetailPage /></PermissionGuard></ProtectedRoute>} />

    {/* Desligamentos */}
    <Route path="/desligamentos" element={<ProtectedRoute><PermissionGuard moduleCode="desligamentos" fallbackRoles={['diretoria', 'rh', 'administrativo']}><TerminationListPage /></PermissionGuard></ProtectedRoute>} />
    <Route path="/desligamentos/new" element={<ProtectedRoute><PermissionGuard moduleCode="desligamentos" fallbackRoles={['diretoria', 'rh', 'administrativo']}><TerminationNewPage /></PermissionGuard></ProtectedRoute>} />
    <Route path="/desligamentos/:id" element={<ProtectedRoute><PermissionGuard moduleCode="desligamentos" fallbackRoles={['diretoria', 'rh', 'administrativo']}><TerminationDetailPage /></PermissionGuard></ProtectedRoute>} />

    {/* Redirects */}
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/nova-solicitacao" element={<Navigate to="/dashboard" replace />} />
    <Route path="/solicitacao/:id" element={<LegacyRequestDetailRedirect />} />
    <Route path="/fleet" element={<Navigate to="/abastecimento" replace />} />
    <Route path="/fleet/new" element={<Navigate to="/abastecimento/new" replace />} />
    <Route path="/fleet/vehicles-admin" element={<Navigate to="/abastecimento/vehicles-admin" replace />} />
    <Route path="/fleet/:id" element={<LegacyRequestDetailRedirect />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
  </Suspense>
);

const App = () => {
  if (missingSupabaseEnvironment.length > 0) {
    return <ConfigurationErrorScreen missingVariables={missingSupabaseEnvironment} />;
  }

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
};

export default App;
