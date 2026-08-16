import React from 'react';
import { Box, Button, Container, Text, VStack } from '@chakra-ui/react';

// Backstop for render-time throws. Added 2026-08-16 alongside the calibration solver-crash
// safety net: the app had NO error boundary and no route errorElement anywhere, so any
// uncaught render error unmounted the entire React root and left a blank white page with no
// way back — confirmed live for the LP solver's near-singular breakdown (see
// docs/decisions/criteria-calibration/criteria-calibration-near-singular-pivot-impact.md).
//
// This is deliberately a BACKSTOP, not the primary handling. CriteriaCalibrationPage catches
// its own solver failures and recovers in place (compute-first + auto-recovery); anything
// reaching here is by definition unanticipated, so the only honest offer is a reload. Kept
// generic (no calibration-specific copy) so it can wrap other routes as-is.
//
// Class component because React has no hook equivalent — componentDidCatch/
// getDerivedStateFromError are only available on classes.

interface Props {
  children: React.ReactNode;
  /** Shown above the reload button. Defaults to a generic message. */
  message?: string;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Nothing swallows the detail — a blank page with a silent console was the old behaviour
    // and is exactly what made the solver crash hard to characterise after the fact.
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
        <Container maxW="4xl" py={10}>
          <VStack gap={4} align="center">
            <Text textAlign="center" color="red.400" fontFamily="body">
              {this.props.message ?? 'Something went wrong on this page.'}
            </Text>
            <Text textAlign="center" color="text.dim" fontSize="sm" fontFamily="body">
              Your saved progress is unaffected.
            </Text>
            <Button colorPalette="orange" onClick={() => window.location.reload()}>
              Reload the page
            </Button>
          </VStack>
        </Container>
      </Box>
    );
  }
}
