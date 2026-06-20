import React from 'react';
import {
  Box,
  Container,
  Flex,
  Heading,
  Image,
  Spinner,
  Tag,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { Header } from './Header';
import { useFavoritesList } from './hooks/useFavoritesList';
import { formatReleaseDate } from './App';

export function FavoritesPage() {
  const { items, loading } = useFavoritesList();

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="container.xl">
        <VStack spacing={6} align="stretch">
          <Header />
          <Heading size="lg">My Favorites</Heading>

          {loading ? (
            <Flex justify="center" align="center" minH="200px">
              {/* Visually-hidden label for test detection */}
              <Box as="span" srOnly>
                spinner
              </Box>
              <Spinner size="xl" color="accent.start" thickness="4px" speed="0.65s" />
            </Flex>
          ) : items.length === 0 ? (
            <Text textAlign="center" color="text.muted">
              No favorites yet. Heart an album from the dashboard to add it here.
            </Text>
          ) : (
            <VStack spacing={3} align="stretch">
              {items.map((item) => (
                <Flex
                  key={item.id}
                  align="center"
                  gap={4}
                  bg="surface.card"
                  borderRadius="lg"
                  p={3}
                  border="1px solid"
                  borderColor="border.default"
                >
                  <Box
                    flexShrink={0}
                    w="48px"
                    h="48px"
                    borderRadius="base"
                    overflow="hidden"
                    bg="surface.darkest"
                  >
                    {item.artworkUrl ? (
                      <Image
                        src={item.artworkUrl}
                        alt={`${item.band} – ${item.album}`}
                        w="48px"
                        h="48px"
                        objectFit="cover"
                      />
                    ) : (
                      <Flex w="100%" h="100%" align="center" justify="center">
                        <Text fontSize="lg" color="text.muted">
                          ♪
                        </Text>
                      </Flex>
                    )}
                  </Box>

                  <Box flex={1} minW={0}>
                    <Text fontWeight="semibold" noOfLines={1}>
                      {item.band} – {item.album}
                    </Text>
                    <Text fontSize="sm" color="text.dim">
                      {formatReleaseDate(item.releaseDate)}
                    </Text>
                    {item.genre.length > 0 && (
                      <Wrap spacing={1} mt={1}>
                        {item.genre.map((g) => (
                          <WrapItem key={g}>
                            <Tag
                              size="sm"
                              bg="whiteAlpha.100"
                              color="purple.300"
                              borderRadius="base"
                            >
                              {g}
                            </Tag>
                          </WrapItem>
                        ))}
                      </Wrap>
                    )}
                  </Box>
                </Flex>
              ))}
            </VStack>
          )}
        </VStack>
      </Container>
    </Box>
  );
}
