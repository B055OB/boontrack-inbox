'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary' + (this.props.name ? ':' + this.props.name : '') + '] Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[50vh] flex items-center justify-center p-6 text-slate-800 antialiased">
          <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200/80 shadow-xs">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Terjadi Kendala Memuat Tampilan
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Browser mendeteksi sedikit kendala rendering tampilan. Silakan muat ulang halaman untuk memulihkan sesi Anda.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-600/20 active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Muat Ulang Halaman</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition cursor-pointer active:scale-95"
              >
                Coba Lagi
              </button>
            </div>

            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <details className="text-left mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-rose-700 overflow-x-auto">
                <summary className="font-bold cursor-pointer select-none">Detail Error (Debug)</summary>
                <pre className="mt-2 whitespace-pre-wrap font-mono">{this.state.error.message}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
