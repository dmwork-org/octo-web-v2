import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (error: Error, reset: () => void) => ReactNode;
  /** 传入 reset 键名,变化时自动 reset(用于 key 重置场景) */
  resetKeys?: unknown[];
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 轻量 ErrorBoundary — 捕获子树渲染错误(含 useSuspenseQuery 抛出的 FetchError),
 * 调用 fallback 渲染降级 UI,避免错误冒泡到根 Error Boundary 导致整页白屏。
 *
 * resetKeys 变化时自动恢复(如 URL id 切换后重新渲染)。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKeys !== this.props.resetKeys) {
      // 用 microtask 避免在 componentDidUpdate 中同步 setState
      queueMicrotask(() => this.setState({ error: null }));
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return this.props.children;
  }
}
