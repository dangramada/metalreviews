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

// Shared pill styling applied to every nav item (active + inactive) so layout
// never shifts when the active route changes.
const navPillBase = {
  fontSize: 'md',
  fontWeight: 'semibold',
  px: 4,
  py: 2,
  borderRadius: 'md',
  textDecoration: 'none',
} as const;

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
            gap={2}
            className="header-desktop"
            sx={{
              '@media (max-width: 47.9375em)': { display: 'none' },
            }}
          >
            <Link
              as={RouterLink}
              to="/"
              {...navPillBase}
              bg={isReviewsActive ? 'accent.border' : 'transparent'}
              color={isReviewsActive ? 'text.primary' : 'text.dim'}
              _hover={{
                textDecoration: 'none',
                bg: isReviewsActive ? 'accent.border' : 'surface.raised',
                color: isReviewsActive ? 'text.primary' : 'accent.start',
              }}
            >
              Reviews
            </Link>
            <Link
              as={RouterLink}
              to="/favorites"
              {...navPillBase}
              bg={isFavoritesActive ? 'accent.border' : 'transparent'}
              color={isFavoritesActive ? 'text.primary' : 'text.dim'}
              _hover={{
                textDecoration: 'none',
                bg: isFavoritesActive ? 'accent.border' : 'surface.raised',
                color: isFavoritesActive ? 'text.primary' : 'accent.start',
              }}
            >
              Favorites
            </Link>

            {/* Vertical divider between nav links and account control */}
            <Box w="1px" alignSelf="stretch" bg="whiteAlpha.400" mx={2} />

            {user ? (
              <Menu>
                <MenuButton
                  as={Button}
                  variant="ghost"
                  leftIcon={<Icon as={FaUserCircle} boxSize={5} color="text.dim" />}
                  {...navPillBase}
                  color="text.dim"
                  _hover={{ color: 'text.primary', bg: 'surface.raised' }}
                  // Override Chakra ghost Button's default light flash on click/open
                  _active={{ bg: 'surface.raised', color: 'text.primary' }}
                  sx={{ '&[aria-expanded=true]': { bg: 'surface.raised', color: 'text.primary' } }}
                >
                  {user.email?.split('@')[0]}
                </MenuButton>
                <MenuList bg="surface.card" borderColor="border.default" minW="120px">
                  <MenuItem
                    bg="surface.card"
                    color="text.primary"
                    _hover={{ bg: 'surface.raised' }}
                    _active={{ bg: 'surface.raised' }}
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
                {...navPillBase}
                bg="transparent"
                color="text.dim"
                _hover={{
                  textDecoration: 'none',
                  bg: 'surface.raised',
                  color: 'accent.start',
                }}
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
                _active={{ bg: 'surface.raised', color: 'text.primary' }}
                sx={{ '&[aria-expanded=true]': { bg: 'surface.raised', color: 'text.primary' } }}
              />
              <MenuList bg="surface.card" borderColor="border.default">
                <MenuItem
                  bg="surface.card"
                  color="text.primary"
                  _hover={{ bg: 'surface.raised' }}
                  _active={{ bg: 'surface.raised' }}
                  onClick={() => navigate('/')}
                >
                  Reviews
                </MenuItem>
                <MenuItem
                  bg="surface.card"
                  color="text.primary"
                  _hover={{ bg: 'surface.raised' }}
                  _active={{ bg: 'surface.raised' }}
                  onClick={() => navigate('/favorites')}
                >
                  Favorites
                </MenuItem>
                {user ? (
                  <MenuItem
                    bg="surface.card"
                    color="text.primary"
                    _hover={{ bg: 'surface.raised' }}
                    _active={{ bg: 'surface.raised' }}
                    onClick={handleLogout}
                  >
                    Log out
                  </MenuItem>
                ) : (
                  <MenuItem
                    bg="surface.card"
                    color="text.primary"
                    _hover={{ bg: 'surface.raised' }}
                    _active={{ bg: 'surface.raised' }}
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
