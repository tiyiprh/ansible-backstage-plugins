import {
  imageContentsSummary,
  syncStateLabel,
} from '../components/ExecutionEnvironments/catalogHelpers';
import { createDemoImages } from './fixtures';
import { getDemoImageMetadata, isDemoImageRef } from './metadata';

it('provides valid unique reserved refs, all four statuses and honest inventories at a fixed clock', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  try {
    const rows = createDemoImages(now);
    expect(new Set(rows.map(row => row.ref)).size).toBe(7);
    expect(rows[4].definitionEntityRef).toBe('component:default/networking-ee');
    expect(
      rows.filter(row => row.definitionEntityRef !== undefined),
    ).toHaveLength(1);
    expect(
      new Set(
        rows.map(row =>
          syncStateLabel(row.lastReconciledAt, row.lastReconcileOk),
        ),
      ),
    ).toEqual(new Set(['Available', 'Syncing', 'Stale', 'Failed']));
    expect(new Set(rows.map(row => row.lastReconciledAt)).size).toBe(7);
    expect(new Set(rows.map(row => row.enumeration.status))).toEqual(
      new Set(['complete', 'partial', 'unknown']),
    );
    expect(imageContentsSummary(rows[0])).toBe('0 collections / 0 plugins');
    expect(rows[2].contentsKnown).toBe(true);
    expect(rows[2].counts).toBeUndefined();
    expect(imageContentsSummary(rows[2])).toBe(
      'Approximate: Unknown collections / Unknown plugins',
    );
    expect(imageContentsSummary(rows[6])).toBe('Contents unknown');
    for (const row of rows) {
      expect(row.ref).toMatch(
        /^demo\.invalid\/utopia\/.+@sha256:[0-9a-f]{64}$/,
      );
      expect(row.registry).not.toBe('');
      expect(row.pullReference).toBe(row.ref);
      expect(row.collections).toEqual([]);
      expect(row.counts?.plugins ?? 0).toBe(0);
      expect(isDemoImageRef(row.ref)).toBe(true);
      expect(getDemoImageMetadata(row.ref)?.note).toBeTruthy();
    }
    expect(getDemoImageMetadata(rows[4].ref)).toEqual({
      sourceType: 'definition-file',
      note: 'Proposed source — not currently provided by the backend',
    });
    expect(getDemoImageMetadata(rows[0].ref)?.sourceType).toBe(
      'external-registry',
    );
  } finally {
    clock.mockRestore();
  }
});

it('recognizes only the strict prefix while metadata is limited to known fixtures', () => {
  expect(isDemoImageRef('demo.invalid/utopia/unknown')).toBe(true);
  expect(getDemoImageMetadata('demo.invalid/utopia/unknown')).toBeUndefined();
  for (const ref of [
    'zot/utopia@sha256:one',
    'demo.invalid/utopia-other/one',
    'other/demo.invalid/utopia/one',
  ]) {
    expect(isDemoImageRef(ref)).toBe(false);
    expect(getDemoImageMetadata(ref)).toBeUndefined();
  }
});
