import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full items-center justify-center bg-[#F7F9FB]">
          <div className="max-w-md w-full text-center px-6">
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#E5E7EB]">
              <AlertTriangle size={32} className="text-rose-500" />
            </div>
            <h1 className="text-2xl font-bold text-[#1F2937] mb-2">Something went wrong</h1>
            <p className="text-[#6B7280] mb-6 leading-relaxed">
              An unexpected error occurred. You can try reloading the page or clicking the button below.
            </p>
            {this.state.error && (
              <pre className="text-xs text-left bg-white border border-[#E5E7EB] rounded-[10px] p-3 mb-6 max-h-32 overflow-auto text-[#6B7280] shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#4FB6B2] hover:bg-[#3FA6A2] text-white rounded-[10px] font-semibold transition shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
              >
                <RotateCcw size={16} /> Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 text-[#1F2937] border border-[#E5E7EB] bg-white hover:bg-[#F1F5F9] rounded-[10px] font-medium transition shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
