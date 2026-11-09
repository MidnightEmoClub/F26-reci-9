import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

// Read the spec in src/intervals/mergeIntervals.ts, then check your progress
// with `npm run mutants:intervals`.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The output is sorted.
// (invariant, algebraic, metamorphic, differential, or conditional)

// Picking both endpoints independently can produce start > end, which the
// precondition forbids. Instead, pick a start and extend it by a non-negative
// length, so every interval is valid by construction.
// A small range also makes touching and nearly-touching endpoints common.
const interval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: -20, max: 20 }), fc.nat({ max: 20 }))
  .map(([start, length]): Interval => [start, start + length]);
const intervalList = fc.array(interval);

// Intervals that are already disjoint and non-touching, built directly: each
// start is a positive gap past the previous end, so start > previousEnd.
const disjointIntervalList: fc.Arbitrary<Interval[]> = fc
  .array(fc.tuple(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 0, max: 10 })), { maxLength: 6 })
  .map(parts => {
    let previousEnd = 0;
    return parts.map(([gap, length]): Interval => {
      const start = previousEnd + gap;
      const end = start + length;
      previousEnd = end;
      return [start, end];
    });
  });

// A tiny, obviously correct oracle: does some interval contain point p?
const coveredBy = (xs: readonly Interval[], p: number): boolean =>
  xs.some(([start, end]) => start <= p && p <= end);

describe('mergeIntervals', () => {
  // Pattern: invariant. Every input interval lies inside some output interval.
  it('every input interval lies inside some output interval', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const uncovered = xs.filter(([s, e]) => !out.some(([a, b]) => a <= s && e <= b));
        expect(uncovered).toEqual([]);
      }),
    );
  });

  // Pattern: invariant. The output is sorted; consecutive intervals neither overlap nor touch.
  it('returns sorted, disjoint, non-touching intervals', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (let i = 0; i < out.length; i += 1) {
          expect(out[i][0]).toBeLessThanOrEqual(out[i][1]);
          if (i > 0) expect(out[i - 1][1]).toBeLessThan(out[i][0]);
        }
      }),
    );
  });

  // Pattern: invariant. The input array and the intervals in it are not modified.
  it('does not modify its input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const before = xs.map(([s, e]): Interval => [s, e]);
        mergeIntervals(xs);
        expect(xs).toEqual(before);
      }),
    );
  });

  // Pattern: algebraic. Merging an already-merged output changes nothing.
  it('is idempotent', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        expect(mergeIntervals(once)).toEqual(once);
      }),
    );
  });

  // Pattern: metamorphic. Reordering the input does not change the output.
  it('is independent of input order', () => {
    fc.assert(
      fc.property(intervalList, intervalList, (xs, ys) => {
        expect(mergeIntervals([...xs, ...ys])).toEqual(mergeIntervals([...ys, ...xs]));
      }),
    );
  });

  // Pattern: differential. Input and output cover exactly the same points, per a point-coverage oracle.
  it('covers exactly the same points as the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        // Endpoints plus the points just outside them; a one-unit gap is
        // probed at its midpoint by the previous interval's end + 0.5.
        const probes = xs.flatMap(([s, e]) => [s, e, s - 0.5, e + 0.5]);
        const mismatches = probes.filter(p => coveredBy(xs, p) !== coveredBy(out, p));
        expect(mismatches).toEqual([]);
      }),
    );
  });

  // Pattern: conditional. If the input is already disjoint and non-touching, the output is the input.
  it('leaves already-disjoint intervals unchanged', () => {
    fc.assert(
      fc.property(disjointIntervalList, xs => {
        expect(mergeIntervals(xs)).toEqual(xs);
      }),
    );
  });
});
