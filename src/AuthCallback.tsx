import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Input,
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react';
import { supabase } from './supabaseClient';
import { primaryButton } from './theme';

type CallbackMode = 'loading' | 'recovery';

export function AuthCallback() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<CallbackMode>('loading');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inputStyle = {
    size: 'md',
    variant: 'outline',
    bg: 'surface.card',
    color: 'text.primary',
    borderColor: 'border.default',
  } as const;

  useEffect(() => {
    // onAuthStateChange fires PASSWORD_RECOVERY when the user arrives via a reset link.
    // The SDK has already exchanged the token from the URL by the time the callback fires.
    // For every other event (SIGNED_IN from email confirmation, later OAuth), redirect to /.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recovery');
      } else if (session) {
        navigate('/', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      // replace: true removes the /auth/callback URL from history — pressing Back after a
      // successful reset would otherwise land back on a form whose token is already consumed.
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : ((err as any)?.message ?? 'Failed to update password. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'recovery') {
    return (
      <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
        <Container maxW="sm">
          <VStack gap={6} align="stretch">
            <Heading size="lg" textAlign="center" color="text.primary">
              Set new password
            </Heading>
            <Box as="form" onSubmit={handleUpdatePassword}>
              <VStack gap={4}>
                <Input
                  {...inputStyle}
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  _placeholder={{ color: 'text.dim' }}
                  required
                />
                <Input
                  {...inputStyle}
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  _placeholder={{ color: 'text.dim' }}
                  required
                />
                {error && (
                  <Text color="red.400" fontSize="sm" alignSelf="flex-start">
                    {error}
                  </Text>
                )}
                <Button
                  {...primaryButton}
                  type="submit"
                  w="100%"
                  loading={loading}
                >
                  Update password
                </Button>
              </VStack>
            </Box>
          </VStack>
        </Container>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary">
      <Flex justify="center" align="center" minH="100vh" direction="column" gap={4}>
        <Spinner size="xl" color="accent.start" thickness="4px" speed="0.65s" />
        <Text color="text.dim">Signing you in…</Text>
      </Flex>
    </Box>
  );
}
