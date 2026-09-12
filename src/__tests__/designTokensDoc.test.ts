// @vitest-environment jsdom
//
// Keeps docs/decisions/design-tokens.md exhaustive: every token this project ADDS to Chakra's
// defaults must be named somewhere in that file.
//
// WHY THIS EXISTS. The doc was a hand-maintained table for months and drifted twice — by
// 2026-09-12 it still described the retired purple accent palette and was missing nine live
// tokens, including four that no decision doc mentioned at all. The convention ("update the doc
// after each feature") is exactly what did not happen, so the fix is structural rather than
// another reminder: adding a token without documenting it now fails the suite. Same technique,
// and same reason, as accuracyTierLabels.test.ts scanning display surfaces for hardcoded labels.
//
// WHAT "CUSTOM" MEANS: the merged config contains all of Chakra's own tokens too, so the list is
// derived by diffing our system against `defaultConfig` rather than by listing names here — a
// hardcoded list would be one more thing to forget to update, which is the bug this prevents.
//
// SCOPE: semantic colours, text styles, and spacing tokens. Recipe and slot-recipe overrides are
// NOT covered — they are overrides of existing Chakra keys rather than additions, so the same
// diff cannot distinguish ours from the defaults. Document those by hand.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { defaultConfig } from '@chakra-ui/react';
import system from '../theme';

const DOC = path.join(__dirname, '..', '..', 'docs', 'decisions', 'design-tokens.md');

interface ThemeConfig {
  theme?: {
    semanticTokens?: { colors?: Record<string, Record<string, unknown>> };
    textStyles?: Record<string, unknown>;
    tokens?: { spacing?: Record<string, unknown> };
  };
}

const ours = (system as unknown as { _config: ThemeConfig })._config;
const base = defaultConfig as ThemeConfig;

function customColorTokens(): string[] {
  const mine = ours.theme?.semanticTokens?.colors ?? {};
  const theirs = base.theme?.semanticTokens?.colors ?? {};
  const out: string[] = [];
  for (const [group, tokens] of Object.entries(mine)) {
    for (const name of Object.keys(tokens)) {
      if (!(group in theirs) || !(name in theirs[group])) out.push(`${group}.${name}`);
    }
  }
  return out;
}

function customKeys(mine: Record<string, unknown> = {}, theirs: Record<string, unknown> = {}) {
  return Object.keys(mine).filter((k) => !(k in theirs));
}

describe('design-tokens.md stays exhaustive', () => {
  const doc = fs.readFileSync(DOC, 'utf8');

  it('documents every custom semantic colour token', () => {
    // A token counts as documented if its full `group.name` appears anywhere in the file. Loose
    // on purpose: this test guards COVERAGE, not prose. What a token is FOR is a judgement the
    // person adding it has to write; all this can check is that they wrote something.
    const missing = customColorTokens().filter((t) => !doc.includes(t));
    expect(missing, `undocumented semantic colour tokens: ${missing.join(', ')}`).toEqual([]);
  });

  it('documents every custom text style', () => {
    const missing = customKeys(ours.theme?.textStyles, base.theme?.textStyles).filter(
      (t) => !doc.includes(t)
    );
    expect(missing, `undocumented text styles: ${missing.join(', ')}`).toEqual([]);
  });

  it('documents every custom spacing token', () => {
    const missing = customKeys(ours.theme?.tokens?.spacing, base.theme?.tokens?.spacing).filter(
      (t) => !doc.includes(t)
    );
    expect(missing, `undocumented spacing tokens: ${missing.join(', ')}`).toEqual([]);
  });
});
