import { toaster } from '../components/ui/toaster';

export function useFeedbackToast() {
  function showSuccess(message: string) {
    toaster.create({ title: message, type: 'success', duration: 3000, closable: true });
  }

  function showError(message: string) {
    toaster.create({ title: message, type: 'error', duration: 4000, closable: true });
  }

  function showAction(message: string, action: { label: string; onClick: () => void }) {
    toaster.create({
      title: message,
      type: 'info',
      duration: 6000,
      closable: true,
      action,
      id: `action-${message}`,
    });
  }

  return { showSuccess, showError, showAction };
}
