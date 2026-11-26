import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw, Store } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('POS Application Error Caught:', error, errorInfo);
  }

  private handleReload = () => {
    const cleanUrl = window.location.origin + window.location.pathname;
    window.location.href = cleanUrl + '?refresh=' + Date.now();
  };

  private handleResetStorage = () => {
    try {
      localStorage.clear();
    } catch {}
    const cleanUrl = window.location.origin + window.location.pathname;
    window.location.href = cleanUrl + '?reset=' + Date.now();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-8 text-center space-y-6 shadow-2xl">
            <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-widest">
                <Store className="w-4 h-4" />
                <span>Deganga CADPFSCS Ltd POS</span>
              </div>
              <h2 className="text-xl font-black text-white">Application Encountered a Temporary Issue</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                The POS platform caught an unexpected rendering state. You can restore your session or reload the terminal below.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-left font-mono text-[11px] text-rose-300 max-h-32 overflow-y-auto">
                {this.state.error.message || 'Unknown runtime error'}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetStorage}
                className="w-full sm:w-auto px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all border border-slate-700"
                title="Clears local browser cache and restores fresh store catalog"
              >
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>Reset Store & Reload</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
