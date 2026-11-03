import type { Entity } from '@backstage/catalog-model';
import type { ExecutionEnvironment } from '../../api';

/** Reconciliation results older than this are displayed as stale. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Match immutable provider annotations, never a mutable tag or truncated entity name. */
export function matchesEnvironment(
  entity: Entity,
  image: ExecutionEnvironment,
): boolean {
  const a = entity.metadata.annotations ?? {};
  return (
    entity.kind.toLowerCase() === 'component' &&
    a['ansible.com/registry'] === image.registry &&
    a['ansible.com/repository'] === image.repository &&
    a['ansible.com/digest'] === image.digest
  );
}

/** Preserve the full digest-scoped reference in one URL segment. */
export function environmentHref(base: string, ref: string): string {
  return `${base}/${encodeURIComponent(ref)}`;
}

/** Unknown inventories must never imply that an image contains no content. */
export function imageContentsSummary(image: ExecutionEnvironment): string {
  if (!image.contentsKnown) return 'Contents unknown';
  return `${image.enumeration.status !== 'complete' ? 'Approximate: ' : ''}${
    image.counts?.collections ?? 'Unknown'
  } collections / ${image.counts?.plugins ?? 'Unknown'} plugins`;
}

/** Relative freshness, with explicit missing/invalid timestamp handling. */
export function relativeTime(value?: string): string {
  if (!value) return 'Never reconciled';
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return 'Unknown reconciliation time';
  if (minutes < 1) return 'Just now';
  let amount: number;
  let unit: string;
  if (minutes < 60) {
    amount = minutes;
    unit = 'minute';
  } else if (minutes < 1440) {
    amount = Math.floor(minutes / 60);
    unit = 'hour';
  } else {
    amount = Math.floor(minutes / 1440);
    unit = 'day';
  }
  return `${amount} ${unit}${amount === 1 ? '' : 's'} ago`;
}

/**
 * Row sync state, derived from the owning registry's last reconciliation time
 * and outcome.
 */
export function syncStateLabel(
  lastReconciledAt?: string,
  lastReconcileOk?: boolean,
): string {
  if (!lastReconciledAt) return 'Syncing';
  if (lastReconcileOk === false) return 'Failed';
  const reconciledAt = new Date(lastReconciledAt).getTime();
  if (Date.now() - reconciledAt > STALE_AFTER_MS) return 'Stale';
  return 'Available';
}

/**
 * Where the artifact came from. Registry scans are the only source today; a
 * "Definition file" source arrives with that integration.
 */
export function sourceLabel(registry?: string): string {
  return registry ? 'External registry' : 'Definition file';
}
