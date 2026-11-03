import type { ReactElement } from 'react';
import { Badge } from '@backstage/ui';
import styles from './StatusBadge.module.css';

export type StatusBadgeTone =
  | 'success'
  | 'info'
  | 'danger'
  | 'warning'
  | 'neutral';

/** BUI Badge with the shared semantic colors used for inventory status and source. */
export function StatusBadge({
  children,
  tone,
}: Readonly<{
  children: string;
  tone: StatusBadgeTone;
}>): ReactElement {
  return (
    <span data-status={tone}>
      <Badge className={tone === 'neutral' ? styles.neutral : styles[tone]}>
        {children}
      </Badge>
    </span>
  );
}
