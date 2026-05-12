import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
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
    console.error('Dashboard render failed', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-dvh bg-ops-bg p-3 text-ops-ink dark:bg-[#121713] dark:text-[#eef3ec] md:p-4">
        <div role="alert" className="mx-auto grid max-w-2xl gap-3 border border-rose-500/50 bg-rose-50/90 p-4 text-sm text-rose-800 shadow-[0_10px_28px_rgb(31_39_34/.08)] dark:bg-rose-950/35 dark:text-rose-100">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-600 dark:text-rose-200">Dashboard Error</div>
          <p className="font-bold">The dashboard hit a recoverable render error.</p>
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words border border-rose-500/25 bg-white/60 p-3 font-mono text-[11px] leading-5 text-rose-900 dark:bg-black/20 dark:text-rose-100">
            {this.state.error.message || String(this.state.error)}
          </pre>
          <button type="button" onClick={this.reset} className="w-fit border border-rose-500/40 bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-800 transition hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-100 dark:hover:bg-rose-900/70">
            Retry
          </button>
        </div>
      </div>
    );
  }
}
