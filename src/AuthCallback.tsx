import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Flex, Spinner, Text } from '@chakra-ui/react';
import { supabase } from './supabaseClient';

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        // Supabase has already exchanged the OAuth code from the URL by the time this runs.
        // If a session exists, go to the dashboard. If not (malformed callback), go to login.
        navigate(data.session ? '/' : '/login', { replace: true });
      })
      .catch(() => {
        // Network-level failure (DNS, TLS, etc.) — getSession() rejects rather than resolving
        // with an error object. Fall back to login so the user is not stuck on the spinner.
        navigate('/login', { replace: true });
      });
  }, [navigate]);

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary">
      <Flex justify="center" align="center" minH="100vh" direction="column" gap={4}>
        <Spinner size="xl" color="accent.start" thickness="4px" speed="0.65s" />
        <Text color="text.dim">Signing you in…</Text>
      </Flex>
    </Box>
  );
}
