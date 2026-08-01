'use client';

import { Component, ReactNode, ErrorInfo } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    fetch('/api/log-client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        url: typeof window !== 'undefined' ? window.location.pathname : null,
      }),
    }).catch(() => {});
  }

  handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-shell">
          <div className="error-boundary-card">
            <div className="error-boundary-title">Something didn't load right</div>
            <p className="error-boundary-text">
              This has been noted. Reloading usually sorts it out — your tasks are safe either way.
            </p>
            <button className="btn btn-steel" onClick={this.handleReload}>Reload Dokkit</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
