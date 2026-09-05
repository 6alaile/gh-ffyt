"use client";

import React, { useEffect, useState, Component, ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Dashboard error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="surface p-8 text-center" role="alert">
          <svg className="mx-auto h-12 w-12 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="10" strokeLinecap="round" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4M12 16h.01" />
          </svg>
          <h3 className="mt-4 text-lg font-medium">Something went wrong</h3>
          <p className="mt-1 text-[fg-muted]">{this.state.error?.message || "An unexpected error occurred"}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn-primary mt-4"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}