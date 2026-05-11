import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="mx-auto max-w-2xl space-y-3 rounded-lg border border-rose-800 bg-rose-900/30 p-6 text-sm text-rose-200">
        <div className="font-semibold text-rose-100">Something went wrong</div>
        <pre className="overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-rose-200/80">
          {error.message || String(error)}
        </pre>
        <button
          type="button"
          onClick={this.reset}
          className="rounded bg-rose-800/60 px-3 py-1 text-xs text-rose-100 hover:bg-rose-800"
        >
          retry
        </button>
      </div>
    );
  }
}
