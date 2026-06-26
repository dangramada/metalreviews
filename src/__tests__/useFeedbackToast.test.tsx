// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFeedbackToast } from '../hooks/useFeedbackToast';

const mockCreate = vi.fn();

vi.mock('../components/ui/toaster', () => ({
  toaster: { create: mockCreate },
}));

describe('useFeedbackToast', () => {
  beforeEach(() => vi.clearAllMocks());

  it('showSuccess calls toaster.create with success type and 3000ms duration', () => {
    const { showSuccess } = useFeedbackToast();
    showSuccess('Added to favorites');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Added to favorites',
        type: 'success',
        duration: 3000,
        closable: true,
      })
    );
  });

  it('showError calls toaster.create with error type and 4000ms duration', () => {
    const { showError } = useFeedbackToast();
    showError('Could not save — try again');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Could not save — try again',
        type: 'error',
        duration: 4000,
        closable: true,
      })
    );
  });

  it('showAction calls toaster.create with info type, 6000ms duration, action, and dedup id', () => {
    const onClick = vi.fn();
    const { showAction } = useFeedbackToast();
    showAction('Log in to save favorites', { label: 'Log in', onClick });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Log in to save favorites',
        type: 'info',
        duration: 6000,
        closable: true,
        action: { label: 'Log in', onClick },
        id: 'action-Log in to save favorites',
      })
    );
  });
});
