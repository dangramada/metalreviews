import { useState, type ReactNode, type Ref } from 'react';
import {
  Button,
  DatePickerContent,
  DatePickerDayTable,
  DatePickerHeader,
  DatePickerMonthTable,
  DatePickerNextTrigger,
  DatePickerPrevTrigger,
  DatePickerRangeText,
  DatePickerRoot,
  DatePickerTrigger,
  DatePickerView,
  DatePickerViewTrigger,
  DatePickerYearTable,
  IconButton,
  Input,
  InputGroup,
  parseDate,
} from '@chakra-ui/react';
import { LuCalendar, LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { Field } from './ui/field';
import {
  MIN_RELEASE_YEAR,
  maxReleaseYear,
  parseReleaseDate,
  releaseDateError,
} from '../lib/aoty/releaseDate';

interface ReleaseDateFieldProps {
  value: string;
  onChange: (value: string) => void;
  helperText?: ReactNode;
  required?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

// The one release date input: free text (a year, a year and month, or a full date) plus a
// calendar for picking a full date. Used wherever the app asks for a missing release date
// (Favorites' add-album drawer, the Contenders date dialog). Validation shows here, from
// parseReleaseDate, once the field has been left; the parent decides what a valid value allows.
// The calendar is inline, not a popup: no positioner, which avoids Floating UI portal and
// coordinate problems inside a Drawer or Dialog.
export function ReleaseDateField({
  value,
  onChange,
  helperText,
  required,
  inputRef,
}: ReleaseDateFieldProps) {
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const parsed = parseReleaseDate(value);

  return (
    <DatePickerRoot
      size="xl"
      open={open}
      onOpenChange={({ open: next }) => setOpen(next)}
      // The calendar cannot reach a date the validation would reject.
      min={parseDate(`${MIN_RELEASE_YEAR}-01-01`)}
      max={parseDate(`${maxReleaseYear()}-12-31`)}
      // Only seed the picker when the text field holds a valid full date (parseDate throws on an
      // impossible one like 2024-02-30).
      value={parsed.ok && parsed.value.length === 10 ? [parseDate(parsed.value)] : []}
      onValueChange={(details) => {
        const iso = details.value[0]?.toString();
        if (iso) {
          onChange(iso);
          setOpen(false);
        }
      }}
    >
      <Field
        required={required}
        label="Release date"
        invalid={touched && value.trim() !== '' && !parsed.ok}
        errorText={parsed.ok ? undefined : releaseDateError(parsed.reason)}
        helperText={helperText}
      >
        <InputGroup
          width="full"
          endElement={
            <DatePickerTrigger
              aria-label="Pick a date"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'inherit',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <LuCalendar />
            </DatePickerTrigger>
          }
        >
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="e.g. 2024, 2024-03, or 2024-03-15"
            bg="surface.page"
            border="2px solid"
            borderColor="border.ruleStrong"
          />
        </InputGroup>
      </Field>
      <DatePickerContent mt={2}>
        <DatePickerView view="day">
          <DatePickerHeader>
            <DatePickerPrevTrigger asChild>
              <IconButton variant="ghost" size="sm" aria-label="Previous month">
                <LuChevronLeft />
              </IconButton>
            </DatePickerPrevTrigger>
            <DatePickerViewTrigger asChild>
              <Button variant="ghost" size="sm">
                <DatePickerRangeText />
              </Button>
            </DatePickerViewTrigger>
            <DatePickerNextTrigger asChild>
              <IconButton variant="ghost" size="sm" aria-label="Next month">
                <LuChevronRight />
              </IconButton>
            </DatePickerNextTrigger>
          </DatePickerHeader>
          <DatePickerDayTable />
        </DatePickerView>
        <DatePickerView view="month">
          <DatePickerHeader>
            <DatePickerPrevTrigger asChild>
              <IconButton variant="ghost" size="sm" aria-label="Previous year">
                <LuChevronLeft />
              </IconButton>
            </DatePickerPrevTrigger>
            <DatePickerViewTrigger asChild>
              <Button variant="ghost" size="sm">
                <DatePickerRangeText />
              </Button>
            </DatePickerViewTrigger>
            <DatePickerNextTrigger asChild>
              <IconButton variant="ghost" size="sm" aria-label="Next year">
                <LuChevronRight />
              </IconButton>
            </DatePickerNextTrigger>
          </DatePickerHeader>
          <DatePickerMonthTable />
        </DatePickerView>
        <DatePickerView view="year">
          <DatePickerHeader>
            <DatePickerPrevTrigger asChild>
              <IconButton variant="ghost" size="sm" aria-label="Previous decade">
                <LuChevronLeft />
              </IconButton>
            </DatePickerPrevTrigger>
            <DatePickerViewTrigger asChild>
              <Button variant="ghost" size="sm">
                <DatePickerRangeText />
              </Button>
            </DatePickerViewTrigger>
            <DatePickerNextTrigger asChild>
              <IconButton variant="ghost" size="sm" aria-label="Next decade">
                <LuChevronRight />
              </IconButton>
            </DatePickerNextTrigger>
          </DatePickerHeader>
          <DatePickerYearTable />
        </DatePickerView>
      </DatePickerContent>
    </DatePickerRoot>
  );
}
