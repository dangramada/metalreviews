import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Box, Button, Container, Flex, Heading, Input, Link, Text, VStack } from '@chakra-ui/react';
import { supabase } from './supabaseClient';
import { primaryButton } from './theme';

type Mode = 'login' | 'signup' | 'forgot-password';

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();

  const inputStyle = {
    size: 'md',
    variant: 'outline',
    bg: 'surface.card',
    color: 'text.primary',
    borderColor: 'border.default',
  } as const;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    // Clear all credential fields on mode switch — avoids stale input confusion
    // and prevents accidental submission of a login password in signup mode.
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setResetSent(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // signUp() resolves without error even when email confirmation is required.
        // We show the confirmation screen; the user can't log in until they click the link.
        setConfirmationSent(true);
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/');
      } else {
        // forgot-password: uses window.location.origin so it works in both dev and production
        // without requiring a VITE_APP_URL env var.
        const redirectTo = `${window.location.origin}/auth/callback`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        // Always show the success screen regardless of whether the email exists —
        // revealing that would tell an attacker which emails are registered.
        setResetSent(true);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : ((err as any)?.message ?? 'An error occurred. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  }

  if (confirmationSent) {
    return (
      <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
        <Container maxW="sm">
          <VStack gap={4} textAlign="center">
            <Text fontSize="lg">Check your email to confirm your account.</Text>
            <Text fontSize="sm" color="text.dim">
              Once confirmed, you can log in below.
            </Text>
            <Link as={RouterLink} to="/login" color="accent.text" fontSize="sm">
              Back to log in
            </Link>
          </VStack>
        </Container>
      </Box>
    );
  }

  if (resetSent) {
    return (
      <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
        <Container maxW="sm">
          <VStack gap={4} textAlign="center">
            <Text fontSize="lg">Check your email for a password reset link.</Text>
            <Link as={RouterLink} to="/login" color="accent.text" fontSize="sm">
              Back to log in
            </Link>
          </VStack>
        </Container>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="sm">
        <VStack gap={6} align="stretch">
          <Heading size="lg" textAlign="center" color="text.primary">
            {mode === 'login' ? 'Log in' : mode === 'signup' ? 'Sign up' : 'Reset password'}
          </Heading>

          <Box as="form" onSubmit={handleSubmit}>
            <VStack gap={4}>
              <Input
                {...inputStyle}
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                _placeholder={{ color: 'text.dim' }}
                required
              />
              {/* Password fields hidden in forgot-password mode — only email needed there */}
              {mode !== 'forgot-password' && (
                <Input
                  {...inputStyle}
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  _placeholder={{ color: 'text.dim' }}
                  required
                />
              )}
              {mode === 'signup' && (
                <Input
                  {...inputStyle}
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  _placeholder={{ color: 'text.dim' }}
                  required
                />
              )}

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
                {mode === 'login' ? 'Log in' : mode === 'signup' ? 'Sign up' : 'Send reset link'}
              </Button>
            </VStack>
          </Box>

          {/*
           * OAuth buttons will go here in a future session (Google, Facebook).
           * Each will call: supabase.auth.signInWithOAuth({ provider: 'google' | 'facebook' })
           * They slot between the password submit button above and the mode controls below.
           */}

          {/* Login mode controls: forgot-password link + sign-up toggle */}
          {mode === 'login' && (
            <>
              <Flex justify="center" fontSize="sm">
                <Button
                  variant="link"
                  size="sm"
                  color="text.dim"
                  fontWeight="normal"
                  onClick={() => switchMode('forgot-password')}
                >
                  Forgot password?
                </Button>
              </Flex>
              <Flex justify="center" align="center" gap={1} fontSize="sm">
                <Text color="text.dim">Don't have an account?</Text>
                <Button
                  variant="link"
                  size="sm"
                  color="accent.text"
                  fontWeight="normal"
                  onClick={() => switchMode('signup')}
                >
                  Sign up
                </Button>
              </Flex>
            </>
          )}

          {/* Signup mode: back-to-login toggle */}
          {mode === 'signup' && (
            <Flex justify="center" align="center" gap={1} fontSize="sm">
              <Text color="text.dim">Already have an account?</Text>
              <Button
                variant="link"
                size="sm"
                color="accent.text"
                fontWeight="normal"
                onClick={() => switchMode('login')}
              >
                Log in
              </Button>
            </Flex>
          )}

          {/* Forgot-password mode: back-to-login link */}
          {mode === 'forgot-password' && (
            <Flex justify="center" fontSize="sm">
              <Button
                variant="link"
                size="sm"
                color="accent.text"
                fontWeight="normal"
                onClick={() => switchMode('login')}
              >
                Back to log in
              </Button>
            </Flex>
          )}

          <Text textAlign="center" fontSize="sm">
            <Link as={RouterLink} to="/" color="text.dim" _hover={{ color: 'text.primary' }}>
              ← Back to dashboard
            </Link>
          </Text>
        </VStack>
      </Container>
    </Box>
  );
}
