import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/types';
import { LayoutDashboard, Shield, LogOut, Bell, Menu, User, Settings, X, Fuel, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.png';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut, hasAnyRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const canManage = hasAnyRole(['diretoria', 'administrativo']);
  const canViewAdmission = hasAnyRole(['diretoria', 'rh', 'administrativo']);
  const primaryRole = user?.roles[0];

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { to: '/fleet', label: 'Abastecimento', icon: Fuel, show: true },
    { to: '/admissions', label: 'Admissões', icon: UserPlus, show: canViewAdmission },
    { to: '/perfil', label: 'Meu Perfil', icon: User, show: true },
    { to: '/auditoria', label: 'Auditoria', icon: Shield, show: canManage },
    { to: '/configuracoes', label: 'Configurações', icon: Settings, show: hasAnyRole(['diretoria']) },
  ].filter(item => item.show);

  const isActive = (path: string) => location.pathname.startsWith(path);

  // Fetch notifications
  useEffect(() => {
    if (!user) return;
    const fetchNotifications = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setNotifications(data || []);
      setUnreadCount(data?.filter(n => !n.read).length || 0);
    };
    fetchNotifications();

    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => { fetchNotifications(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const clearAll = async () => {
    if (!user) return;
    await supabase.from('notifications').delete().eq('user_id', user.id);
    setNotifications([]);
    setUnreadCount(0);
  };

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-sidebar transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-5 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <img src={logo} alt="SV Engenharia" className="w-10 h-10 rounded-full object-contain bg-white p-0.5" />
              <div>
                <h1 className="text-base font-bold text-sidebar-primary">SV Engenharia</h1>
                <p className="text-[11px] text-sidebar-muted">Gestão Corporativa</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="lg:hidden text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
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

          <div className="px-3 py-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-sidebar-accent text-sidebar-accent-foreground text-sm font-semibold">
                {user.full_name?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-primary truncate">{user.full_name || user.email}</p>
                <p className="text-[11px] text-sidebar-muted">{primaryRole ? ROLE_LABELS[primaryRole] : 'Sem papel'}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={async () => { await signOut(); navigate('/login'); }}
              className="w-full justify-start gap-3 px-3 mt-1 text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50"
            >
              <LogOut className="w-4 h-4" /> Sair
            </Button>
          </div>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-40 bg-foreground/20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 lg:px-8 py-3 bg-card border-b border-border">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-semibold text-foreground">
              {navItems.find(i => isActive(i.to))?.label || 'Detalhes'}
            </h2>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" onClick={markAllRead}>
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <div className="p-3 border-b border-border flex items-center justify-between">
                <p className="text-sm font-semibold">Notificações</p>
                {notifications.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearAll}>Limpar</Button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground text-center">Nenhuma notificação</p>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className={`px-3 py-2.5 border-b border-border last:border-0 ${!n.read ? 'bg-primary/5' : ''}`}>
                      <p className="text-sm font-medium text-foreground">{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.message}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(n.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
