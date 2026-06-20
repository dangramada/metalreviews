import React from 'react';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  IconButton,
  Link,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import { FaUserCircle } from 'react-icons/fa';
import { useAuth } from './AuthContext';
import { supabase } from './supabaseClient';

export function Header() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/');
  }

  const isReviewsActive = location.pathname === '/';
  const isFavoritesActive = location.pathname === '/favorites';

  return (
    <Flex align="center" justify="space-between" mb={6}>
      <Heading as="h1" size="xl" bgGradient="linear(to-r, accent.start, accent.end)" bgClip="text">
        Metal Reviews
      </Heading>

      {!loading && (
        <Flex align="center" gap={6}>
          {/* Desktop: nav links + account control.
              Visually hidden below md via CSS class; rendered in DOM at all sizes so
              screen readers and tests (jsdom) can always access links and buttons.
              Chakra responsive display props use display:none which blocks jsdom role
              queries, so we use a CSS class for breakpoint toggling instead. */}
          <Flex
            align="center"
            gap={6}
            className="header-desktop"
            sx={{
              '@media (max-width: 47.9375em)': { display: 'none' },
            }}
          >
            <Flex align="center" gap={4}>
              <Link
                as={RouterLink}
                to="/"
                fontSize="sm"
                color={isReviewsActive ? 'accent.text' : 'text.dim'}
                textDecoration={isReviewsActive ? 'underline' : 'none'}
                _hover={{ color: 'accent.start', textDecoration: 'none' }}
              >
                Reviews
              </Link>
              <Link
                as={RouterLink}
                to="/favorites"
                fontSize="sm"
                color={isFavoritesActive ? 'accent.text' : 'text.dim'}
                textDecoration={isFavoritesActive ? 'underline' : 'none'}
                _hover={{ color: 'accent.start', textDecoration: 'none' }}
              >
                Favorites
              </Link>
            </Flex>

            {user ? (
              <Menu>
                <MenuButton
                  as={Button}
                  size="sm"
                  variant="ghost"
                  rightIcon={<Icon as={FaUserCircle} boxSize={4} color="text.dim" />}
                  color="text.dim"
                  _hover={{ color: 'text.primary', bg: 'surface.raised' }}
                >
                  {user.email?.split('@')[0]}
                </MenuButton>
                <MenuList bg="surface.card" borderColor="border.default" minW="120px">
                  <MenuItem
                    bg="surface.card"
                    color="text.primary"
                    _hover={{ bg: 'surface.raised' }}
                    onClick={handleLogout}
                  >
                    Log out
                  </MenuItem>
                </MenuList>
              </Menu>
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

          {/* Mobile: hamburger that consolidates nav + account.
              Visually hidden above md via CSS class; always in DOM. */}
          <Box
            className="header-mobile"
            sx={{
              '@media (min-width: 48em)': { display: 'none' },
            }}
          >
            <Menu>
              <MenuButton
                as={IconButton}
                icon={<HamburgerIcon />}
                variant="ghost"
                aria-label="Open menu"
                color="text.dim"
                _hover={{ color: 'text.primary', bg: 'surface.raised' }}
              />
              <MenuList bg="surface.card" borderColor="border.default">
                <MenuItem
                  bg="surface.card"
                  color="text.primary"
                  _hover={{ bg: 'surface.raised' }}
                  onClick={() => navigate('/')}
                >
                  Reviews
                </MenuItem>
                <MenuItem
                  bg="surface.card"
                  color="text.primary"
                  _hover={{ bg: 'surface.raised' }}
                  onClick={() => navigate('/favorites')}
                >
                  Favorites
                </MenuItem>
                {user ? (
                  <MenuItem
                    bg="surface.card"
                    color="text.primary"
                    _hover={{ bg: 'surface.raised' }}
                    onClick={handleLogout}
                  >
                    Log out
                  </MenuItem>
                ) : (
                  <MenuItem
                    bg="surface.card"
                    color="text.primary"
                    _hover={{ bg: 'surface.raised' }}
                    onClick={() => navigate('/login')}
                  >
                    Log in
                  </MenuItem>
                )}
              </MenuList>
            </Menu>
          </Box>
        </Flex>
      )}
    </Flex>
  );
}
