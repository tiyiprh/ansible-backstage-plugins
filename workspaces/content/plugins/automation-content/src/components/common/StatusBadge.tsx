import type { ReactElement, ReactNode } from 'react';
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
  icon,
  size = 'small',
  variant = 'filled',
}: Readonly<{
  children: string;
  tone: StatusBadgeTone;
  icon?: ReactNode;
  size?: 'small' | 'medium';
  variant?: 'filled' | 'outline';
}>): ReactElement {
  return (
    <span data-status={tone}>
      <Badge
        className={[
          tone === 'neutral' ? styles.neutral : styles[tone],
          icon ? styles.withIcon : '',
          variant === 'outline' ? styles.outline : '',
        ].join(' ')}
        icon={icon}
        size={size}
      >
        {children}
      </Badge>
    </span>
  );
}
