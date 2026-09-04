import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-noir flex items-center justify-center px-6">
          <div className="glass max-w-md w-full p-8 text-center">
            <AlertTriangle size={48} className="text-gold mx-auto mb-4" />
            <h2 className="font-display text-2xl text-white font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted text-sm mb-6">{this.state.error?.message || 'An unexpected error occurred.'}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.hash = '#/'; }}
              className="inline-flex items-center gap-2 bg-gold hover:bg-gold/80 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw size={14} /> Go Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
