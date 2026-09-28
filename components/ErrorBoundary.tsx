'use client';

import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';

import { apiUrl } from '@/lib/authedFetch';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  errorId: string | null;
};

function makeErrorId(): string {
  try {
    return `err-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  } catch {
    return 'err-unknown';
  }
}

export default class ErrorBoundary extends Component<
  Props,
  State
> {
  state: State = {
    hasError: false,
    errorId: null,
  };

  static getDerivedStateFromError(): State {
    return {
      hasError: true,
      errorId: makeErrorId(),
    };
  }

  componentDidCatch(
    error: Error,
    info: ErrorInfo
  ) {
    const errorId =
      this.state.errorId || makeErrorId();

    /*
     * Client-side logging is best-effort.
     *
     * Never allow error reporting itself to create another
     * application failure.
     */
    fetch(
      apiUrl('/api/log-client-error'),
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          errorId,
          message:
            error?.message ||
            'Unknown client error',
          stack:
            error?.stack || null,
          componentStack:
            info?.componentStack || null,
          url:
            typeof window !== 'undefined'
              ? window.location.href
              : null,
          userAgent:
            typeof navigator !==
            'undefined'
              ? navigator.userAgent
              : null,
        }),
        keepalive: true,
      }
    ).catch(() => {});
  }

  handleReload = () => {
    if (
      typeof window !==
      'undefined'
    ) {
      window.location.reload();
    }
  };

  handleGoHome = () => {
    if (
      typeof window !==
      'undefined'
    ) {
      window.location.assign('/');
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main
        className="error-boundary-shell"
        role="alert"
        aria-labelledby="error-boundary-title"
      >
        <section
          className="error-boundary-card"
        >
          <div
            className="error-boundary-kicker"
            aria-hidden="true"
          >
            Dokkit
          </div>

          <h1
            id="error-boundary-title"
            className="error-boundary-title"
          >
            Something didn't load right
          </h1>

          <p className="error-boundary-text">
            Dokkit hit a problem while
            rendering this screen. Your
            saved work is not deliberately
            affected by this error.
          </p>

          {this.state.errorId && (
            <p className="error-boundary-id">
              Reference: {this.state.errorId}
            </p>
          )}

          <div className="error-boundary-actions">
            <button
              type="button"
              className="btn btn-steel"
              onClick={this.handleReload}
            >
              Reload Dokkit
            </button>

            <button
              type="button"
              className="btn btn-quiet"
              onClick={this.handleGoHome}
            >
              Go to Today
            </button>
          </div>
        </section>
      </main>
    );
  }
}
