import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Global Error Boundary to catch render errors and prevent white screens of death.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in application:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div style={{
          height: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)',
          padding: '24px', textAlign: 'center'
        }}>
          <h2 style={{ color: 'var(--color-functional-red)', marginBottom: '16px', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={24} /> Something went wrong
          </h2>
          <p style={{ maxWidth: '400px', marginBottom: '24px', opacity: 0.8, fontSize: '14px', lineHeight: '1.5' }}>
            An unexpected error occurred while rendering this view. You can try reloading the application.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre style={{
              background: 'var(--color-bg-secondary)', padding: '12px',
              borderRadius: '6px', fontSize: '11px', color: 'var(--color-functional-red)',
              maxWidth: '80%', overflowX: 'auto', marginBottom: '20px', textAlign: 'left'
            }}>
              {this.state.error.toString()}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '9px 18px', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-functional-red)', color: 'var(--color-bg-primary)',
              border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px'
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
