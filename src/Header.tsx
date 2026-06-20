import React from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Flex, Heading, Button, Text, Link } from '@chakra-ui/react';
import { useAuth } from './AuthContext';
import { supabase } from './supabaseClient';

export function Header() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/');
  }

  return (
    <Flex align="center" justify="space-between" mb={6}>
      <Heading as="h1" size="xl" bgGradient="linear(to-r, accent.start, accent.end)" bgClip="text">
        Metal Reviews Dashboard
      </Heading>

      {/* Auth controls — hidden during initial session hydration to avoid a flash */}
      {!loading && (
        <Flex align="center" gap={3}>
          {user ? (
            <>
              <Text fontSize="sm" color="text.dim">
                {user.email?.split('@')[0]}
              </Text>
              <Button
                size="sm"
                bg="surface.card"
                color="gray.300"
                border="1px solid"
                borderColor="border.default"
                borderRadius="md"
                _hover={{ borderColor: 'border.hover', color: 'text.primary', bg: 'surface.card' }}
                _active={{ bg: 'surface.raised' }}
                onClick={handleLogout}
              >
                Log out
              </Button>
            </>
          ) : (
            <Link
              as={RouterLink}
              to="/login"
              fontSize="sm"
              color="accent.text"
              _hover={{ color: 'accent.start', textDecoration: 'none' }}
            >
              Log in
            </Link>
          )}
        </Flex>
      )}
    </Flex>
  );
}
