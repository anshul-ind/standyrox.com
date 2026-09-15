"use client";

import { Component } from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Short message shown when a render/API error is caught. */
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Wraps components that call API routes / render complex content. If anything
 * throws while rendering, show a panic-friendly fallback with a "Try again"
 * button instead of a blank screen or a raw console exception.
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-xl border border-red-500/30 bg-zinc-900/40 p-6 font-mono text-sm text-red-300">
          <p>{this.props.fallbackTitle ?? "Something went wrong loading this view."}</p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-lg border border-white/10 bg-zinc-800 px-4 py-2 text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}