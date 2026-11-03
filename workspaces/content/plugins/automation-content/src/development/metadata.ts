import { DEMO_VARIANTS, demoImageRef } from './fixtures';

/** Reserved demo namespace, including unknown refs that must never reach the backend. */
export function isDemoImageRef(ref: string): boolean {
  return ref.startsWith('demo.invalid/utopia/');
}

/** Frontend-only provenance, deliberately separate from the backend domain model. */
export function getDemoImageMetadata(ref: string):
  | {
      sourceType: 'external-registry' | 'definition-file';
      note: string;
    }
  | undefined {
  const index = DEMO_VARIANTS.findIndex((_, i) => demoImageRef(i) === ref);
  if (index === -1) return undefined;
  return {
    sourceType: index === 4 ? 'definition-file' : 'external-registry',
    note:
      index === 4
        ? 'Proposed source — not currently provided by the backend'
        : `Synthetic development preview: ${DEMO_VARIANTS[index]}. No registry operation is running; inventory is empty or unknown.`,
  };
}
