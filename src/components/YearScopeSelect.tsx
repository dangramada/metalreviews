import { NativeSelect } from '@chakra-ui/react';
import { parseYearParam, scopeLabel, serializeScope, type Scope } from '../lib/aoty/yearScope';

// The shared year selector for /aoty and /aoty/contenders. Same look as Favorites' year filter;
// renders nothing unless there is more than one scope to choose between.
export function YearScopeSelect({
  options,
  value,
  onChange,
}: {
  options: Scope[];
  value: Scope | null;
  onChange: (next: Scope) => void;
}) {
  if (value === null || options.length < 2) return null;
  return (
    <NativeSelect.Root size="sm" w="auto" minW="120px">
      <NativeSelect.Field
        aria-label="Year"
        bg="surface.card"
        border="2px solid"
        borderColor="border.ruleStrong"
        css={{ '& option': { background: 'gray.800' } }}
        value={serializeScope(value)}
        onChange={(e) => {
          const next = parseYearParam(e.target.value);
          if (next !== null) onChange(next);
        }}
      >
        {options.map((s) => (
          <option key={serializeScope(s)} value={serializeScope(s)}>
            {scopeLabel(s)}
          </option>
        ))}
      </NativeSelect.Field>
    </NativeSelect.Root>
  );
}
