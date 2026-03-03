import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[CTX ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h3>{this.props.fallbackMessage || 'Что-то пошло не так'}</h3>
          <pre className="error-details">{this.state.error?.message}</pre>
          <button type="button" className="retry-btn" onClick={this.handleRetry}>
            Повторить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
