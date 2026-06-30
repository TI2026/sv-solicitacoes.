import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border text-center">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">Ops! Algo deu errado</h2>
            <p className="text-slate-600 mb-6 text-sm">
              Encontramos um erro inesperado ao carregar esta parte do sistema.
              {this.state.error?.message && (
                <span className="block mt-4 text-left overflow-hidden text-ellipsis font-mono text-xs text-red-600 bg-red-50 p-3 rounded border border-red-100">
                  {this.state.error.message}
                </span>
              )}
            </p>
            <Button onClick={() => window.location.reload()} variant="outline" className="w-full gap-2">
              <RefreshCcw className="w-4 h-4" />
              Recarregar Página
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
