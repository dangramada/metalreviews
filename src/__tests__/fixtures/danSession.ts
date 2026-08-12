// Frozen snapshot of Dan's real calibration session — the 58 answers that were live in
// `user_calibration_answers` on 2026-08-12, pulled READ-ONLY (no Supabase writes were made
// while producing this file, and none are made by the tests that use it).
//
// This is the session that got stuck: with Bland's-rule pivoting, asking question #59 made
// the value LP report "infeasible even with slack" on a large fraction of answer orderings,
// which is what the Dantzig switch fixes. See
// docs/decisions/criteria-calibration-dantzig-fix.md and the stress test behind it,
// docs/decisions/criteria-calibration-dantzig-stress-test.md.
//
// Kept here rather than in lib/criteria-calibration/fixtures.ts deliberately: this is
// regression data for solver.ts/simplex.ts specifically, not a shared elicitation fixture.

import type { ComparisonResult, Profile } from '../../lib/criteria-calibration/preferenceGraph';

export interface DanSessionRound {
  profileA: Profile;
  profileB: Profile;
  result: ComparisonResult;
}

export const DAN_SESSION_LEVELS_PER_CRITERION = [5, 5, 5, 5, 5, 5];

/** The 58 answers Dan had actually committed when the session stalled. */
export const DAN_58_ANSWERS: DanSessionRound[] = [
  { profileA: { 0: 5, 1: 1 }, profileB: { 0: 1, 1: 5 }, result: 'B' },
  { profileA: { 0: 5, 2: 1 }, profileB: { 0: 1, 2: 5 }, result: 'equal' },
  { profileA: { 0: 5, 3: 1 }, profileB: { 0: 1, 3: 5 }, result: 'A' },
  { profileA: { 0: 5, 4: 1 }, profileB: { 0: 1, 4: 5 }, result: 'equal' },
  { profileA: { 0: 5, 5: 1 }, profileB: { 0: 1, 5: 5 }, result: 'A' },
  { profileA: { 1: 5, 2: 1 }, profileB: { 1: 1, 2: 5 }, result: 'A' },
  { profileA: { 1: 5, 3: 1 }, profileB: { 1: 1, 3: 5 }, result: 'A' },
  { profileA: { 1: 5, 4: 1 }, profileB: { 1: 1, 4: 5 }, result: 'equal' },
  { profileA: { 1: 5, 5: 1 }, profileB: { 1: 1, 5: 5 }, result: 'B' },
  { profileA: { 2: 5, 3: 1 }, profileB: { 2: 1, 3: 5 }, result: 'A' },
  { profileA: { 2: 5, 4: 1 }, profileB: { 2: 1, 4: 5 }, result: 'B' },
  { profileA: { 2: 5, 5: 1 }, profileB: { 2: 1, 5: 5 }, result: 'equal' },
  { profileA: { 3: 5, 4: 1 }, profileB: { 3: 1, 4: 5 }, result: 'B' },
  { profileA: { 3: 5, 5: 1 }, profileB: { 3: 1, 5: 5 }, result: 'B' },
  { profileA: { 4: 5, 5: 1 }, profileB: { 4: 1, 5: 5 }, result: 'B' },
  { profileA: { 1: 4, 5: 3 }, profileB: { 1: 3, 5: 4 }, result: 'A' },
  { profileA: { 4: 4, 5: 2 }, profileB: { 4: 2, 5: 4 }, result: 'B' },
  { profileA: { 4: 3, 5: 2 }, profileB: { 4: 2, 5: 3 }, result: 'equal' },
  { profileA: { 2: 3, 4: 4 }, profileB: { 2: 4, 4: 3 }, result: 'B' },
  { profileA: { 0: 3, 3: 3 }, profileB: { 0: 4, 3: 2 }, result: 'B' },
  { profileA: { 1: 2, 5: 5 }, profileB: { 1: 3, 5: 4 }, result: 'B' },
  { profileA: { 0: 3, 1: 4 }, profileB: { 0: 2, 1: 5 }, result: 'A' },
  { profileA: { 0: 3, 2: 3 }, profileB: { 0: 2, 2: 4 }, result: 'A' },
  { profileA: { 0: 4, 1: 2 }, profileB: { 0: 2, 1: 4 }, result: 'B' },
  { profileA: { 4: 4, 5: 1 }, profileB: { 4: 2, 5: 3 }, result: 'B' },
  { profileA: { 1: 2, 2: 1 }, profileB: { 1: 1, 2: 2 }, result: 'B' },
  { profileA: { 1: 1, 5: 5 }, profileB: { 1: 4, 5: 2 }, result: 'B' },
  { profileA: { 4: 2, 5: 4 }, profileB: { 4: 1, 5: 5 }, result: 'A' },
  { profileA: { 2: 4, 4: 4 }, profileB: { 2: 5, 4: 3 }, result: 'A' },
  { profileA: { 0: 4, 4: 2 }, profileB: { 0: 3, 4: 3 }, result: 'A' },
  { profileA: { 2: 2, 3: 2 }, profileB: { 2: 1, 3: 3 }, result: 'A' },
  { profileA: { 0: 5, 3: 4 }, profileB: { 0: 4, 3: 5 }, result: 'A' },
  { profileA: { 0: 3, 1: 4, 2: 2 }, profileB: { 0: 1, 1: 3, 2: 5 }, result: 'A' },
  { profileA: { 1: 4, 2: 3, 5: 2 }, profileB: { 1: 4, 2: 4, 5: 1 }, result: 'A' },
  { profileA: { 2: 4, 3: 5, 5: 2 }, profileB: { 2: 5, 3: 4, 5: 2 }, result: 'A' },
  { profileA: { 0: 4, 2: 3, 4: 1 }, profileB: { 0: 1, 2: 4, 4: 3 }, result: 'B' },
  { profileA: { 0: 5, 3: 2, 5: 3 }, profileB: { 0: 3, 3: 2, 5: 5 }, result: 'A' },
  { profileA: { 0: 1, 3: 3, 5: 4 }, profileB: { 0: 2, 3: 5, 5: 1 }, result: 'A' },
  { profileA: { 0: 5, 3: 2, 5: 3 }, profileB: { 0: 4, 3: 1, 5: 5 }, result: 'A' },
  { profileA: { 1: 3, 2: 4, 5: 3 }, profileB: { 1: 4, 2: 3, 5: 2 }, result: 'B' },
  { profileA: { 1: 4, 3: 1, 4: 2 }, profileB: { 1: 4, 3: 3, 4: 1 }, result: 'A' },
  { profileA: { 1: 3, 3: 1, 4: 4 }, profileB: { 1: 2, 3: 3, 4: 4 }, result: 'A' },
  { profileA: { 3: 5, 4: 3, 5: 4 }, profileB: { 3: 4, 4: 4, 5: 4 }, result: 'A' },
  { profileA: { 2: 5, 3: 3, 5: 2 }, profileB: { 2: 3, 3: 3, 5: 4 }, result: 'B' },
  { profileA: { 0: 4, 4: 3, 5: 1 }, profileB: { 0: 4, 4: 1, 5: 2 }, result: 'equal' },
  { profileA: { 1: 3, 4: 5, 5: 2 }, profileB: { 1: 5, 4: 3, 5: 3 }, result: 'B' },
  { profileA: { 1: 1, 2: 5, 4: 4, 5: 3 }, profileB: { 1: 3, 2: 4, 4: 2, 5: 2 }, result: 'B' },
  { profileA: { 0: 5, 2: 4, 3: 4, 5: 1 }, profileB: { 0: 1, 2: 5, 3: 5, 5: 4 }, result: 'B' },
  { profileA: { 0: 1, 1: 1, 3: 4, 4: 3 }, profileB: { 0: 4, 1: 2, 3: 1, 4: 1 }, result: 'A' },
  { profileA: { 0: 4, 1: 4, 2: 1, 3: 4 }, profileB: { 0: 3, 1: 5, 2: 2, 3: 2 }, result: 'B' },
  { profileA: { 1: 2, 2: 5, 3: 3, 5: 3 }, profileB: { 1: 3, 2: 2, 3: 4, 5: 4 }, result: 'B' },
  { profileA: { 0: 1, 1: 4, 3: 2, 5: 3 }, profileB: { 0: 3, 1: 1, 3: 3, 5: 5 }, result: 'B' },
  { profileA: { 1: 2, 2: 4, 3: 3, 4: 2 }, profileB: { 1: 4, 2: 2, 3: 2, 4: 3 }, result: 'B' },
  { profileA: { 0: 3, 3: 1, 4: 1, 5: 5 }, profileB: { 0: 2, 3: 3, 4: 5, 5: 1 }, result: 'equal' },
  { profileA: { 0: 2, 1: 2, 3: 4, 4: 2 }, profileB: { 0: 4, 1: 3, 3: 2, 4: 3 }, result: 'B' },
  { profileA: { 0: 4, 1: 5, 2: 2, 4: 3 }, profileB: { 0: 2, 1: 2, 2: 3, 4: 4 }, result: 'A' },
  {
    profileA: { 0: 5, 1: 1, 3: 4, 4: 2, 5: 2 },
    profileB: { 0: 3, 1: 2, 3: 2, 4: 4, 5: 3 },
    result: 'B',
  },
  {
    profileA: { 0: 5, 1: 3, 3: 3, 4: 3, 5: 5 },
    profileB: { 0: 2, 1: 4, 3: 2, 4: 5, 5: 4 },
    result: 'A',
  },
];

/**
 * Question #59 — the pair the driver deterministically offers at the 58-answer state,
 * reconstructed from the live driver during the 2026-08-11 diagnostic pass. Answering this
 * is what triggered the original crash; the crash was answer-independent, so the regression
 * test exercises all three possible results.
 */
export const DAN_QUESTION_59 = {
  profileA: { 0: 3, 2: 3, 3: 5, 4: 1, 5: 3 } as Profile,
  profileB: { 0: 2, 2: 1, 3: 3, 4: 5, 5: 4 } as Profile,
};

/**
 * Value ranges (min/max per criterion/level) and totalSlack produced by the PRE-Dantzig
 * Bland's-rule solver on each fixture where it converged cleanly, captured 2026-08-12 before
 * the switch. The parity test asserts Dantzig reproduces these — this is the evidence that
 * the change is numerically equivalent where the old rule worked at all, not merely that it
 * stops crashing. (Point estimates are deliberately NOT included: the Chebyshev-center LP is
 * under-determined here and the two rules pick different, equally optimal centers — see the
 * decision doc.)
 */
export const BLAND_REFERENCE_RESULTS = {
  REAL_SESSION: {
    totalSlack: 0,
    ranges: [
      [
        [0, 0],
        [0, 0.1991630000000053],
        [0.17147937142857114, 0.1991630000000053],
        [0.1714793714285712, 0.19956199999999918],
        [0.18481698913043454, 0.19956199999999918],
      ],
      [
        [0, 0],
        [0, 0.19916300000000317],
        [0.17147960000000004, 0.19916300000000317],
        [0.17147959999999987, 0.22854039999999962],
        [0.2008569999999971, 0.22854039999999962],
      ],
      [
        [0, 0],
        [0, 0.19856499999999805],
        [0.151789924137931, 0.19856499999999805],
        [0.15178992413793085, 0.1991630000000016],
        [0.17147939999999987, 0.1991630000000016],
      ],
      [
        [0, 0],
        [0, 0.19826600000000394],
        [0.14139524999999983, 0.19826600000000394],
        [0.14139524999999986, 0.1995616000000025],
        [0.1848167934782608, 0.1995616000000025],
      ],
      [
        [0, 0],
        [0, 0.22060458620689644],
        [0.20055760000000017, 0.22060458620689644],
        [0.2005575999999998, 0.2285405999999996],
        [0.2008566000000003, 0.2285405999999996],
      ],
    ],
  },
  REAL_PRODUCTION: {
    totalSlack: 0,
    ranges: [
      [
        [0, 0],
        [0, 0.9985019999999992],
        [-2.7755575615628914e-17, 0.9986019999999992],
        [0.00009966666666661688, 0.9986019999999992],
        [0.1669158333333333, 0.9986019999999992],
      ],
      [
        [0, 0],
        [0, 0.4991009999999998],
        [0.00009949999999998899, 0.4992009999999998],
        [0.0003995000000000249, 0.4995007499999997],
        [0.0004990000000000272, 0.4995007499999997],
      ],
      [
        [0, 0],
        [0, 0.33286766666666645],
        [0, 0.3329676666666666],
        [0.00019899999999997795, 0.3330673333333331],
        [0.00039900000000006597, 0.3330673333333331],
      ],
      [
        [0, 0],
        [0, 0.24950099999999997],
        [0.00019950000000001453, 0.24970099999999998],
        [0.0002990000000000234, 0.24980075],
        [0.000299499999999947, 0.24980074999999993],
      ],
      [
        [0, 0],
        [0, 0.1996007999999999],
        [0.00019900000000000573, 0.1998007999999999],
        [0.00019949999999997796, 0.1998007999999999],
        [0.00019949999999997793, 0.1998007999999999],
      ],
      [
        [0, 0],
        [0, 0.1664174999999999],
        [0, 0.16641749999999994],
        [0, 0.16641749999999994],
        [0, 0.16641749999999994],
      ],
    ],
  },
  N42: {
    totalSlack: 0,
    ranges: [
      [
        [0, 0],
        [0.00039950000004166893, 0.24945125000003557],
        [0.0005993333333507758, 0.24965124999999172],
        [0.0006990000000589323, 0.24975049999999616],
        [0.0006990000000664809, 0.2497504999999955],
      ],
      [
        [0, 0],
        [0.00029899999999894063, 0.4984024999999199],
        [0.0004990000002907545, 0.49870149999995433],
        [0.1668326666666448, 0.49890149999995387],
        [0.200139399999976, 0.49900149999995913],
      ],
      [
        [0, 0],
        [0.00019950000000002117, 0.1995608000000086],
        [0.0004990000000402179, 0.19974099999997913],
        [0.0005990000000430241, 0.19984039999999967],
        [0.0005990000000406094, 0.1998403999999835],
      ],
      [
        [0, 0],
        [0.00019899999999996459, 0.24925225000001588],
        [0.0003990000000007321, 0.24945124999999901],
        [0.0005993333333509561, 0.24965124999999122],
        [0.0006990000000657314, 0.24975049999999513],
      ],
      [
        [0, 0],
        [0.0003989999999376853, 0.49860249999997414],
        [0.09130809090909339, 0.4990014999999922],
        [0.10036899999999382, 0.4990014999999847],
        [0.20013919999996868, 0.4990014999999894],
      ],
    ],
  },
  DEGREE_ANOMALY: {
    totalSlack: 0.0006000000000000001,
    ranges: [
      [
        [0, 0],
        [0, 0.19964100000000026],
        [0.0002989999999997716, 0.1999405000000002],
        [0.0003989999999999131, 0.20004030000000012],
        [0.16661644444444448, 0.20004030000000012],
      ],
      [
        [0, 0],
        [0, 0.19958100000000037],
        [0.00009899999999996145, 0.19978099999999982],
        [0.08348283333333341, 0.20008039999999988],
        [0.16666641666666665, 0.2000804],
      ],
      [
        [0, 0],
        [0.00009949999999997522, 0.19980100000000045],
        [0.00009949999999963678, 0.1998009999999998],
        [0.08344949999999979, 0.2000003],
        [0.16659966666666665, 0.20000029999999996],
      ],
      [
        [0, 0],
        [0, 0.16658350000000002],
        [0, 0.16658350000000005],
        [0, 0.16658350000000005],
        [0, 0.16658350000000005],
      ],
      [
        [0, 0],
        [0.00009900000000000027, 0.199961],
        [0.00009899999999998955, 0.19996099999999994],
        [0.00019900000000024033, 0.20006026666666699],
        [0.16664975000000012, 0.2000602666666669],
      ],
      [
        [0, 0],
        [0.00019899999999999207, 0.19992100000000093],
        [0.00019900000000031153, 0.19992100000000115],
        [0.000397999999999788, 0.20012040000000075],
        [0.16663308333333332, 0.20012040000000036],
      ],
    ],
  },
} as const;
