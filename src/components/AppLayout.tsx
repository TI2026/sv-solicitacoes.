import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getUnreadCount, markNotificationsRead, getNotifications } from '@/lib/store';
import { LayoutDashboard, PlusCircle, FileText, Shield, LogOut, Bell, Menu, X, Fuel, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { ROLE_LABELS } from '@/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user) return null;

  const unreadCount = getUnreadCount(user.id);
  const notifications = getNotifications(user.id).slice(0, 8);
  const canViewAudit = ['ADMINISTRATIVO', 'ADMIN'].includes(user.role);

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/nova-solicitacao', label: 'Nova Solicitação', icon: PlusCircle },
  ];

  if (canViewAudit) {
    navItems.push({ to: '/auditoria', label: 'Auditoria', icon: Shield });
  }

  const isActive = (path: string) => location.pathname === path;

  const handleNotifClick = () => {
    markNotificationsRead(user.id);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-sidebar transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sidebar-accent">
              <Fuel className="w-5 h-5 text-sidebar-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-sidebar-primary">Gestão Corp</h1>
              <p className="text-[11px] text-sidebar-muted">Controle corporativo</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map(item => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.to)
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </nav>

          {/* User section */}
          <div className="px-3 py-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-sidebar-accent text-sidebar-accent-foreground text-sm font-semibold">
                {user.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-primary truncate">{user.name}</p>
                <p className="text-[11px] text-sidebar-muted">{ROLE_LABELS[user.role]}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={() => { logout(); navigate('/login'); }}
              className="w-full justify-start gap-3 px-3 mt-1 text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 lg:px-8 py-3 bg-card border-b border-border">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-semibold text-foreground">
              {navItems.find(i => isActive(i.to))?.label || 'Detalhes'}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" onClick={handleNotifClick}>
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="p-3 border-b border-border">
                  <p className="text-sm font-semibold">Notificações</p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">Nenhuma notificação</p>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className={`px-3 py-2.5 border-b border-border last:border-0 ${!n.read ? 'bg-muted/50' : ''}`}>
                        <p className="text-sm text-foreground">{n.message}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(n.createdAt).toLocaleString('pt-BR')}</p>
                      </div>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
