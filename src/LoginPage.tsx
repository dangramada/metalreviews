import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Input,
  Link,
  Text,
  VStack,
} from '@chakra-ui/react';
import { supabase } from './supabaseClient';

type Mode = 'login' | 'signup';

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const navigate = useNavigate();

  const inputStyle = {
    size: 'md',
    variant: 'outline',
    bg: 'surface.card',
    color: 'text.primary',
    borderColor: 'border.default',
  } as const;

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
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/');
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : (err as any)?.message ?? 'An error occurred. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (confirmationSent) {
    return (
      <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
        <Container maxW="sm">
          <VStack spacing={4} textAlign="center">
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

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="sm">
        <VStack spacing={6} align="stretch">
          <Heading size="lg" textAlign="center" color="text.primary">
            {mode === 'login' ? 'Log in' : 'Sign up'}
          </Heading>

          <Box as="form" onSubmit={handleSubmit}>
            <VStack spacing={4}>
              <Input
                {...inputStyle}
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                _placeholder={{ color: 'text.dim' }}
                required
              />
              <Input
                {...inputStyle}
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                _placeholder={{ color: 'text.dim' }}
                required
              />
              {/* Confirm password — only shown in signup mode */}
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
                type="submit"
                w="100%"
                bg="accent.border"
                color="white"
                _hover={{ bg: 'teal.600' }}
                _active={{ bg: 'teal.700' }}
                isLoading={loading}
              >
                {mode === 'login' ? 'Log in' : 'Sign up'}
              </Button>
            </VStack>
          </Box>

          {/*
           * OAuth buttons will go here in a future session (Google, Facebook).
           * Each will call: supabase.auth.signInWithOAuth({ provider: 'google' | 'facebook' })
           * They slot between the password submit button above and the mode toggle below.
           */}

          <Flex justify="center" align="center" gap={1} fontSize="sm">
            <Text color="text.dim">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            </Text>
            <Button
              variant="link"
              size="sm"
              color="accent.text"
              fontWeight="normal"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError(null);
                setEmail('');
                setPassword('');
                setConfirmPassword('');
              }}
            >
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </Button>
          </Flex>

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
