import { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  ActionButton,
  Box,
  CalloutContent,
  CalloutDescription,
  CalloutRoot,
  CalloutTitle,
  VStack,
} from '@seed-design/react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
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
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <Box padding="24px" maxWidth="640px" style={{ margin: '32px auto' }}>
        <VStack gap="12px">
          <CalloutRoot tone="critical">
            <CalloutContent>
              <CalloutTitle>Something went wrong</CalloutTitle>
              <CalloutDescription>
                {error.message || String(error)}
              </CalloutDescription>
            </CalloutContent>
          </CalloutRoot>
          <ActionButton variant="criticalSolid" size="small" onClick={this.reset}>
            Retry
          </ActionButton>
        </VStack>
      </Box>
    );
  }
}
