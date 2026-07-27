import { Heading } from '@chakra-ui/react';

// Fixed text, deliberately not editable — unlike the 1000minds reference this
// pattern was checked against, which supports per-project question customization
// for enterprise users. Slant Take's context is fixed and singular.
export function QuestionPrompt() {
  return (
    <Heading as="h2" fontFamily="heading" fontSize="2xl" color="text.primary" textAlign="center">
      Which of these 2 alternatives do you prefer?
    </Heading>
  );
}
