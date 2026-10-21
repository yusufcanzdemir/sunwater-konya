import { Component, type ReactNode } from 'react';

/** Keeps a failing optional part (e.g. the map) from taking the whole page down. */
export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Bileşen hatası:', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
