import { extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
  colors: {
    brand: {
      score: '#c9a227', // score badge background
      scoreText: '#111111', // score badge text
    },
  },
  semanticTokens: {
    colors: {
      'surface.page': { default: 'gray.900' }, // page background
      'surface.card': { default: 'gray.800' }, // card + control background
      'surface.raised': { default: 'gray.700' }, // button active state
      'surface.darkest': { default: 'gray.900' }, // artwork fallback bg
      'border.default': { default: 'gray.600' }, // all borders
      'border.hover': { default: 'gray.400' }, // hover borders
      'text.primary': { default: 'white' },
      'text.muted': { default: 'gray.500' }, // icons, empty state
      'text.dim': { default: 'gray.400' }, // date, summary text
      'accent.start': { default: 'teal.300' }, // heading gradient start, spinner
      'accent.end': { default: 'blue.500' }, // heading gradient end
      'accent.border': { default: 'teal.500' }, // source badge background
      'accent.text': { default: 'teal.300' }, // source badge text
    },
  },
  components: {
    Input: { defaultProps: { size: 'md' } },
    Select: { defaultProps: { size: 'md' } },
    Switch: {
      baseStyle: {
        track: {
          bg: 'gray.600',
          _checked: { bg: 'teal.500' },
        },
      },
    },
  },
});

export default theme;
