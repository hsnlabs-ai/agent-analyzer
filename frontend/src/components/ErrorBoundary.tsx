import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || "Unexpected Studio rendering error",
    };
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-panel">
          <h2>Blueprint Studio Recovery</h2>
          <p>{this.state.errorMessage}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload Studio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
