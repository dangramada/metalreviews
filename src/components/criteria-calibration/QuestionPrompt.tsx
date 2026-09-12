import { Text } from '@chakra-ui/react';

// `Text as="h2"`, not `Heading` (2026-09-12): Heading's recipe hardcodes the display face, which
// would fight the shared `cardTitle` style this now uses. The element stays an h2, so the
// document outline is unchanged — only the type is.
//
// "two", spelled, not "2" — prose at this size, and it matches the design.
//
// Fixed text, deliberately not editable — unlike the 1000minds reference this
// pattern was checked against, which supports per-project question customization
// for enterprise users. Slant Take's context is fixed and singular.
export function QuestionPrompt() {
  return (
    <Text as="h2" textStyle="cardTitle" color="text.primary" textAlign="center">
      Which of these two alternatives do you prefer?
    </Text>
  );
}
