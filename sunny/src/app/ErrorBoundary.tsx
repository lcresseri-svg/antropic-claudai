import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort error boundary: instead of a white screen, render a friendly
 * recovery card. No financial data or stack traces are shown or logged to any
 * remote service — the error stays in the local console for debugging.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Local console only — never sent anywhere, never includes user data.
    console.error('ErrorBoundary:', error);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 bg-bg flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-card border border-divider rounded-2xl p-6 text-center space-y-4">
          <p className="text-2xl" aria-hidden>⚠️</p>
          <h1 className="text-lg font-semibold text-primary">Qualcosa è andato storto</h1>
          <p className="text-sm text-secondary">
            Si è verificato un errore imprevisto. I tuoi dati sono al sicuro: riprova
            oppure ricarica l'app.
          </p>
          <div className="flex gap-2 justify-center">
            <button type="button" onClick={this.reset}
              className="px-4 py-2.5 rounded-xl bg-elevated text-sm font-medium text-primary min-h-[44px]">
              Riprova
            </button>
            <button type="button" onClick={() => window.location.reload()}
              className="px-4 py-2.5 rounded-xl glass-cta-gold text-sm font-semibold min-h-[44px]">
              Ricarica
            </button>
          </div>
        </div>
      </div>
    );
  }
}
