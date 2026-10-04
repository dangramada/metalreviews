// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import system from '../theme';
import { ReleaseDateField } from '../components/ReleaseDateField';
import { maxReleaseYear } from '../lib/aoty/releaseDate';

function Harness({ initial = '', onValue }: { initial?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <ChakraProvider value={system}>
      <ReleaseDateField
        required
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue?.(v);
        }}
        helperText="Helper copy"
      />
    </ChakraProvider>
  );
}

const input = () => screen.getByPlaceholderText('e.g. 2024, 2024-03, or 2024-03-15');

describe('ReleaseDateField', () => {
  it('is a labelled text field with the helper text and a calendar button', () => {
    render(<Harness />);
    expect(screen.getByLabelText(/Release date/)).toBe(input());
    expect(screen.getByText('Helper copy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick a date' })).toBeInTheDocument();
  });

  it('passes typed text up as is', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.change(input(), { target: { value: '2024-03' } });
    expect(onValue).toHaveBeenLastCalledWith('2024-03');
    expect((input() as HTMLInputElement).value).toBe('2024-03');
  });

  it('shows the validation error only after the field was left, and never for empty text', async () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: '3036' } });
    expect(screen.queryByText(/Enter a year between/)).toBeNull();
    fireEvent.blur(input());
    expect(
      await screen.findByText(`Enter a year between 1900 and ${maxReleaseYear()}.`)
    ).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: '' } });
    expect(screen.queryByText(/Enter a year between/)).toBeNull();
  });

  it('does not crash on an impossible full date (the calendar is only seeded from a valid one)', () => {
    render(<Harness initial="2024-02-30" />);
    expect((input() as HTMLInputElement).value).toBe('2024-02-30');
  });

  it('seeds the calendar from a valid full date and picking a day writes the ISO date', async () => {
    const onValue = vi.fn();
    render(<Harness initial="2019-05-10" onValue={onValue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
    const day = await screen.findByRole('button', { name: /May 17, 2019/ });
    fireEvent.click(day);
    await waitFor(() => expect(onValue).toHaveBeenLastCalledWith('2019-05-17'));
  });

  it('keeps the calendar inside the accepted range at both ends', async () => {
    const { unmount } = render(<Harness initial={`${maxReleaseYear()}-12-15`} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Switch to next month' })).toBeDisabled()
    );
    expect(screen.getByRole('button', { name: 'Switch to previous month' })).toBeEnabled();
    unmount();

    render(<Harness initial="1900-01-15" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Switch to previous month' })).toBeDisabled()
    );
  });
});
