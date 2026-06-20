import React from 'react';
import { useToast, Box, Button } from '@chakra-ui/react';

export function useFeedbackToast() {
  const toast = useToast();

  function showSuccess(message: string) {
    toast({
      title: message,
      status: 'success',
      duration: 3000,
      isClosable: true,
      position: 'bottom-right',
    });
  }

  function showError(message: string) {
    toast({
      title: message,
      status: 'error',
      duration: 4000,
      isClosable: true,
      position: 'bottom-right',
    });
  }

  function showAction(message: string, action: { label: string; onClick: () => void }) {
    toast({
      id: `action-${message}`,
      position: 'bottom-right',
      duration: 6000,
      isClosable: true,
      render: ({ onClose }) => (
        <Box
          bg="surface.card"
          color="text.primary"
          px={4}
          py={3}
          borderRadius="md"
          boxShadow="lg"
          display="flex"
          alignItems="center"
          gap={3}
          border="1px solid"
          borderColor="border.default"
        >
          <Box flex={1} fontSize="sm">
            {message}
          </Box>
          <Button
            size="sm"
            variant="outline"
            borderColor="border.default"
            color="text.primary"
            _hover={{ borderColor: 'border.hover' }}
            onClick={() => {
              action.onClick();
              onClose();
            }}
          >
            {action.label}
          </Button>
        </Box>
      ),
    });
  }

  return { showSuccess, showError, showAction };
}
