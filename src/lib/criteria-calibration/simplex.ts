// Generic dense Big-M simplex LP solver: minimize c^T x subject to Ax {<=,=,>=} b, x >= 0.
//
// Purpose-built for the small LPs the Criteria Calibration value solver constructs
// (dozens of variables/constraints) — not a general-purpose numerical library. No
// external LP dependency exists in package.json, and none is warranted at this problem
// size; a straightforward dense tableau is simpler to reason about and fast enough.
//
// Uses Big-M (a single large penalty coefficient on artificial variables) rather than
// two-phase simplex, and Bland's rule for entering/leaving variable selection to avoid
// cycling on degenerate tableaus (which this problem shape — many equal-cost ties from
// repeated monotonicity constraints — is prone to).

export type ConstraintType = 'le' | 'ge' | 'eq';

export interface Constraint {
  coeffs: number[]; // length === numVars
  type: ConstraintType;
  rhs: number;
}

export interface LinearProgram {
  numVars: number;
  /** Minimize objective^T x. */
  objective: number[];
  constraints: Constraint[];
}

export interface LPSolution {
  feasible: boolean;
  x: number[]; // length === numVars
  objectiveValue: number;
}

const EPS = 1e-9;
const BIG_M = 1e7;
const MAX_ITERATIONS = 2000;

export function solveLP(lp: LinearProgram): LPSolution {
  const numOriginal = lp.numVars;

  // Normalize so every constraint has rhs >= 0 (required for the initial basic
  // feasible solution built below).
  const rows = lp.constraints.map((c) => {
    if (c.rhs < 0) {
      const flippedType: ConstraintType = c.type === 'le' ? 'ge' : c.type === 'ge' ? 'le' : 'eq';
      return { coeffs: c.coeffs.map((v) => -v), type: flippedType, rhs: -c.rhs };
    }
    return { coeffs: c.coeffs.slice(), type: c.type, rhs: c.rhs };
  });

  const numRows = rows.length;

  // Each 'le' row gets a slack column; each 'ge' row gets a surplus column AND an
  // artificial column; each 'eq' row gets only an artificial column.
  const rowMeta = rows.map((r) => {
    if (r.type === 'le') return { slackSign: 1, needsArtificial: false };
    if (r.type === 'ge') return { slackSign: -1, needsArtificial: true };
    return { slackSign: 0, needsArtificial: true };
  });

  const numSlackSurplus = rowMeta.filter((m) => m.slackSign !== 0).length;
  const numArtificial = rowMeta.filter((m) => m.needsArtificial).length;
  const numVars = numOriginal + numSlackSurplus + numArtificial;

  let slackCursor = numOriginal;
  let artCursor = numOriginal + numSlackSurplus;
  const slackColOfRow: (number | null)[] = [];
  const artColOfRow: (number | null)[] = [];
  for (const meta of rowMeta) {
    slackColOfRow.push(meta.slackSign !== 0 ? slackCursor++ : null);
    artColOfRow.push(meta.needsArtificial ? artCursor++ : null);
  }

  const tableau: number[][] = Array.from({ length: numRows + 1 }, () =>
    new Array(numVars + 1).fill(0)
  );
  const basis: number[] = new Array(numRows).fill(-1);

  for (let i = 0; i < numRows; i++) {
    const row = rows[i];
    for (let j = 0; j < numOriginal; j++) tableau[i][j] = row.coeffs[j] ?? 0;
    const meta = rowMeta[i];
    if (meta.slackSign !== 0) tableau[i][slackColOfRow[i]!] = meta.slackSign;
    if (meta.needsArtificial) {
      tableau[i][artColOfRow[i]!] = 1;
      basis[i] = artColOfRow[i]!;
    } else {
      basis[i] = slackColOfRow[i]!;
    }
    tableau[i][numVars] = row.rhs;
  }

  for (let j = 0; j < numOriginal; j++) tableau[numRows][j] = lp.objective[j] ?? 0;
  for (let i = 0; i < numRows; i++) {
    if (rowMeta[i].needsArtificial) tableau[numRows][artColOfRow[i]!] = BIG_M;
  }
  // Artificial variables start basic, so their reduced cost in the objective row must be
  // driven to zero by eliminating them via their (already-identity) constraint rows.
  for (let i = 0; i < numRows; i++) {
    const b = basis[i];
    const coeff = tableau[numRows][b];
    if (Math.abs(coeff) > EPS) {
      for (let j = 0; j <= numVars; j++) tableau[numRows][j] -= coeff * tableau[i][j];
    }
  }

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let enter = -1;
    for (let j = 0; j < numVars; j++) {
      if (tableau[numRows][j] < -EPS) {
        enter = j; // Bland's rule: first (smallest-index) negative reduced cost
        break;
      }
    }
    if (enter === -1) break; // optimal

    let leave = -1;
    let bestRatio = Infinity;
    for (let i = 0; i < numRows; i++) {
      const coeff = tableau[i][enter];
      if (coeff > EPS) {
        const ratio = tableau[i][numVars] / coeff;
        if (
          ratio < bestRatio - EPS ||
          (Math.abs(ratio - bestRatio) <= EPS && (leave === -1 || basis[i] < basis[leave]))
        ) {
          bestRatio = ratio;
          leave = i;
        }
      }
    }
    if (leave === -1) {
      return { feasible: false, x: new Array(numOriginal).fill(0), objectiveValue: NaN }; // unbounded
    }

    const pivot = tableau[leave][enter];
    for (let j = 0; j <= numVars; j++) tableau[leave][j] /= pivot;
    for (let i = 0; i <= numRows; i++) {
      if (i === leave) continue;
      const factor = tableau[i][enter];
      if (Math.abs(factor) > EPS) {
        for (let j = 0; j <= numVars; j++) tableau[i][j] -= factor * tableau[leave][j];
      }
    }
    basis[leave] = enter;
  }

  for (let i = 0; i < numRows; i++) {
    if (artColOfRow[i] !== null && basis[i] === artColOfRow[i] && tableau[i][numVars] > 1e-6) {
      return { feasible: false, x: new Array(numOriginal).fill(0), objectiveValue: NaN };
    }
  }

  const x = new Array(numOriginal).fill(0);
  for (let i = 0; i < numRows; i++) {
    if (basis[i] < numOriginal) x[basis[i]] = tableau[i][numVars];
  }
  let objectiveValue = 0;
  for (let j = 0; j < numOriginal; j++) objectiveValue += (lp.objective[j] ?? 0) * x[j];

  return { feasible: true, x, objectiveValue };
}
