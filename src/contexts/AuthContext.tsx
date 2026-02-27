import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { User } from '@/types';
import { getUserByEmail, createUser, initializeStore, addAuditLog } from '@/lib/store';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => { success: boolean; error?: string };
  register: (name: string, email: string, password: string, role: User['role'], department: string) => { success: boolean; error?: string };
  logout: () => void;
  refreshUser: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    initializeStore();
    const saved = localStorage.getItem('gc_current_user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  const login = useCallback((email: string, password: string) => {
    const found = getUserByEmail(email);
    if (!found) return { success: false, error: 'Usuário não encontrado' };
    if (found.password !== password) return { success: false, error: 'Senha incorreta' };
    setUser(found);
    localStorage.setItem('gc_current_user', JSON.stringify(found));
    addAuditLog(found.id, 'LOGIN', 'user', found.id, `Login realizado: ${found.email}`);
    return { success: true };
  }, []);

  const register = useCallback((name: string, email: string, password: string, role: User['role'], department: string) => {
    const exists = getUserByEmail(email);
    if (exists) return { success: false, error: 'Email já cadastrado' };
    const newUser = createUser({ name, email, password, role, department });
    setUser(newUser);
    localStorage.setItem('gc_current_user', JSON.stringify(newUser));
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    if (user) addAuditLog(user.id, 'LOGOUT', 'user', user.id, 'Logout');
    setUser(null);
    localStorage.removeItem('gc_current_user');
  }, [user]);

  const refreshUser = useCallback(() => {
    const saved = localStorage.getItem('gc_current_user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch {}
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, refreshUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
