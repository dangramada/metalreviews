// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { SelectableRow } from '../components/SelectableRow';
import system from '../theme';

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}

describe('SelectableRow', () => {
  const onToggleSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggles when the card body is clicked', () => {
    render(
      <SelectableRow selected={false} onToggleSelect={onToggleSelect} ariaLabel="Select X">
        <div data-testid="card-body">Card content</div>
      </SelectableRow>,
      { wrapper }
    );
    fireEvent.click(screen.getByTestId('card-body'));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith(true);
  });

  // desktopOnly's checkbox/ring hide is real CSS (an @media rule in an emotion-injected
  // stylesheet), not a conditional render — and jsdom doesn't evaluate that stylesheet's @media
  // rules for getComputedStyle regardless of window.innerWidth (empirically confirmed: forcing
  // innerWidth to 500 still reported `display: block`). So rather than a real-viewport test that
  // can't actually exercise the branch, this stubs getComputedStyle for the checkbox column
  // element directly — verifying our click-handler logic (does it correctly no-op when the
  // column is computed-hidden?) independent of jsdom's incomplete CSS engine.
  it('does not toggle a card-body click when the checkbox column is computed-hidden (desktopOnly, mobile width)', () => {
    const { container } = render(
      <SelectableRow
        desktopOnly
        selected={false}
        onToggleSelect={onToggleSelect}
        ariaLabel="Select X"
      >
        <div data-testid="card-body">Card content</div>
      </SelectableRow>,
      { wrapper }
    );
    const checkboxColumn = container.querySelector('input[type="checkbox"]')!.closest('label')!
      .parentElement as HTMLElement;
    const realGetComputedStyle = window.getComputedStyle;
    const spy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((el: Element, pseudo?: string | null) =>
        el === checkboxColumn
          ? ({ display: 'none' } as CSSStyleDeclaration)
          : realGetComputedStyle(el, pseudo)
      );
    try {
      fireEvent.click(screen.getByTestId('card-body'));
      expect(onToggleSelect).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('still toggles a card-body click when desktopOnly but the checkbox column is visible', () => {
    render(
      <SelectableRow
        desktopOnly
        selected={false}
        onToggleSelect={onToggleSelect}
        ariaLabel="Select X"
      >
        <div data-testid="card-body">Card content</div>
      </SelectableRow>,
      { wrapper }
    );
    fireEvent.click(screen.getByTestId('card-body'));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
  });

  it('does not toggle when an action button inside the row is clicked, and the button still fires', () => {
    const onAction = vi.fn();
    render(
      <SelectableRow selected={false} onToggleSelect={onToggleSelect} ariaLabel="Select X">
        <button onClick={onAction}>Rate</button>
      </SelectableRow>,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rate' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it('does not toggle a second time from the checkbox itself — the hidden input is inside a <label>, which the wrapper ignores by closest()', async () => {
    render(
      <SelectableRow selected={false} onToggleSelect={onToggleSelect} ariaLabel="Select X">
        <div>Card</div>
      </SelectableRow>,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select X' }));
    // Ark's checkbox machine dispatches CHECKED.SET asynchronously — the callback lands a tick
    // after the click, not synchronously within it.
    await waitFor(() => expect(onToggleSelect).toHaveBeenCalledTimes(1));
  });

  // Same regression this app already guards elsewhere (see docs/decisions/aoty/
  // aoty-contenders-implementation.md's "Code review" section): a bare aria-label on <Checkbox>
  // lands on Ark's wrapping <label>, not the actual role="checkbox" <input> — getByRole's name
  // matching alone doesn't catch that, since jsdom's accessible-name computation is more lenient
  // than a real screen reader.
  it('puts aria-label on the hidden input itself, not just the wrapping label', () => {
    render(
      <SelectableRow selected={false} onToggleSelect={onToggleSelect} ariaLabel="Select X">
        <div>Card</div>
      </SelectableRow>,
      { wrapper }
    );
    const input = document.querySelector('input[type="checkbox"]');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('aria-label', 'Select X');
  });

  // jsdom doesn't implement the browser's native "Space activates a focused checkbox" behavior
  // (confirmed: a bare keydown never flips `checked` or fires onChange), and this project has no
  // @testing-library/user-event installed to simulate it — so this drives the input's own
  // .click() the way the browser's default action would, and asserts our wrapper doesn't
  // interfere (no double-toggle, no swallowed event).
  it('toggles exactly once via a keyboard-triggered click on the focused checkbox', async () => {
    render(
      <SelectableRow selected={false} onToggleSelect={onToggleSelect} ariaLabel="Select X">
        <div>Card</div>
      </SelectableRow>,
      { wrapper }
    );
    const input = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: ' ', code: 'Space' });
    fireEvent.click(input);
    fireEvent.keyUp(input, { key: ' ', code: 'Space' });
    await waitFor(() => expect(onToggleSelect).toHaveBeenCalledTimes(1));
  });
});
