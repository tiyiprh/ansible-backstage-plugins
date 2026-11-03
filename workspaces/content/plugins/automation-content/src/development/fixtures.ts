import type { ExecutionEnvironment } from '../api';

/** Stable reserved references; these artifacts never exist in a real registry. */
export const DEMO_VARIANTS = [
  'available',
  'syncing',
  'stale',
  'failed',
  'definition-file',
  'older',
  'unknown',
] as const;

/** Immutable, valid digest references keep demo detail routes isolated from live data. */
export function demoImageRef(index: number): string {
  return `demo.invalid/utopia/demo/utopia-${DEMO_VARIANTS[index]}@sha256:${(
    index + 1
  )
    .toString(16)
    .padStart(64, '0')}`;
}

/** Only inventory-backed cases reuse configured live content; unknown cases stay unknown. */
export function hasDemoInventory(ref: string): boolean {
  return [0, 2, 3, 4, 5].some(index => demoImageRef(index) === ref);
}

/** Create synthetic empty/unknown inventories with dates relative to adapter initialization. */
export function createDemoImages(now = Date.now()): ExecutionEnvironment[] {
  const ages = [
    5 * 60000,
    undefined,
    3 * 86400000,
    2 * 3600000,
    3600000,
    90 * 86400000,
    12 * 3600000,
  ];
  return DEMO_VARIANTS.map((variant, index) => {
    const ref = demoImageRef(index);
    const complete = index === 0;
    const incompleteStatus = index === 2 ? 'partial' : 'unknown';
    return {
      ref,
      ...(variant === 'definition-file'
        ? { definitionEntityRef: 'component:default/networking-ee' }
        : {}),
      type: 'execution-environment',
      registry: `demo-utopia-${variant}`,
      repository: `demo/utopia-${variant}`,
      digest: ref.split('@')[1],
      tags: ['synthetic-preview'],
      pullReference: ref,
      contentsKnown: complete || incompleteStatus === 'partial',
      enumeration: {
        status: complete ? 'complete' : incompleteStatus,
        source: complete ? 'build-time-manifest' : 'external-introspection',
      },
      counts: complete ? { collections: 0, plugins: 0 } : undefined,
      collections: [],
      lastReconciledAt:
        ages[index] === undefined
          ? undefined
          : new Date(now - ages[index]!).toISOString(),
      lastReconcileOk: index === 1 ? undefined : index !== 3,
    };
  });
}
