import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

it.each([
  ['Available', 'success'],
  ['Syncing', 'info'],
  ['Failed', 'danger'],
  ['Stale', 'warning'],
  ['Definition file', 'info'],
  ['External registry', 'neutral'],
] as const)('renders %s with the %s tone', (label, tone) => {
  const { container } = render(<StatusBadge tone={tone}>{label}</StatusBadge>);
  expect(screen.getByText(label)).toBeTruthy();
  expect(container.querySelector(`[data-status="${tone}"]`)).toBeTruthy();
});
