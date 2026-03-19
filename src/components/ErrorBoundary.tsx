"use client";

import React, { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary component to catch React errors
 * Wrap pages or sections that might throw errors
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("Error caught by boundary:", error);
      console.error("Error info:", errorInfo);
    }

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-96 flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-8 h-8 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-red-900 mb-2">
                    Something went wrong
                  </h2>
                  <p className="text-sm text-red-700 mb-4">
                    {this.state.error?.message ||
                      "An unexpected error occurred. Please try refreshing the page."}
                  </p>

                  {process.env.NODE_ENV === "development" && (
                    <details className="mb-4 cursor-pointer">
                      <summary className="text-xs text-red-600 font-medium hover:text-red-700">
                        Error details (dev only)
                      </summary>
                      <pre className="mt-2 p-2 bg-red-100 text-red-900 text-xs rounded overflow-auto max-h-48">
                        {this.state.error?.stack}
                      </pre>
                    </details>
                  )}

                  <button
                    onClick={this.handleReset}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Try again
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Functional error boundary wrapper
 * @example
 * <ErrorBoundaryFunctional>
 *   <YourComponent />
 * </ErrorBoundaryFunctional>
 */
export function ErrorBoundaryFunctional({
  children,
  fallback,
  onError,
}: ErrorBoundaryProps) {
  return (
    <ErrorBoundary fallback={fallback} onError={onError}>
      {children}
    </ErrorBoundary>
  );
}
