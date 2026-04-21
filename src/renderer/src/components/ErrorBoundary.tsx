import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { t } from "../../../shared/i18n";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="error-boundary">
          <div className="error-boundary-card">
            <h2 className="error-boundary-title">
              {t("errors.boundaryTitle")}
            </h2>
            <p className="error-boundary-message">
              {this.state.error?.message || t("errors.boundaryDefaultMessage")}
            </p>
            <button
              className="btn btn-primary"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              {t("common.retry")}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
