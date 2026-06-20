// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import theme from '../theme';
import { useFeedbackToast } from '../hooks/useFeedbackToast';

const mockToast = vi.fn();

vi.mock('@chakra-ui/react', async () => {
  const actual = await vi.importActual<typeof import('@chakra-ui/react')>('@chakra-ui/react');
  return { ...actual, useToast: () => mockToast };
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChakraProvider theme={theme}>{children}</ChakraProvider>;
}

describe('useFeedbackToast', () => {
  beforeEach(() => vi.clearAllMocks());

  it('showSuccess calls toast with success status and 3000ms duration', () => {
    const { result } = renderHook(() => useFeedbackToast(), { wrapper });
    result.current.showSuccess('Added to favorites');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Added to favorites',
        status: 'success',
        duration: 3000,
        isClosable: true,
        position: 'bottom-right',
      })
    );
  });

  it('showError calls toast with error status and 4000ms duration', () => {
    const { result } = renderHook(() => useFeedbackToast(), { wrapper });
    result.current.showError('Could not save — try again');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Could not save — try again',
        status: 'error',
        duration: 4000,
        isClosable: true,
        position: 'bottom-right',
      })
    );
  });

  it('showAction calls toast with null duration and a render prop', () => {
    const { result } = renderHook(() => useFeedbackToast(), { wrapper });
    result.current.showAction('Log in to save favorites', {
      label: 'Log in',
      onClick: vi.fn(),
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: null,
        isClosable: true,
        position: 'bottom-right',
        render: expect.any(Function),
      })
    );
  });
});
