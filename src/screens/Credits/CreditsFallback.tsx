import { Component, type ErrorInfo, type ReactNode } from 'react';

interface CreditsRenderBoundaryProps {
  children: ReactNode;
  onFailure: (error: Error) => void;
}

interface CreditsRenderBoundaryState {
  failed: boolean;
}

export class CreditsRenderBoundary extends Component<
  CreditsRenderBoundaryProps,
  CreditsRenderBoundaryState
> {
  state: CreditsRenderBoundaryState = { failed: false };

  static getDerivedStateFromError(): CreditsRenderBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onFailure(error);
  }

  render() {
    if (this.state.failed) return <CreditsFallback />;
    return this.props.children;
  }
}

export default function CreditsFallback() {
  return (
    <div className="credits-fallback" role="status" aria-live="polite">
      <div className="credits-fallback__eye" aria-hidden="true">◉</div>
      <strong>Credits cinematic unavailable</strong>
      <span>Fallback presentation placeholder</span>
    </div>
  );
}
