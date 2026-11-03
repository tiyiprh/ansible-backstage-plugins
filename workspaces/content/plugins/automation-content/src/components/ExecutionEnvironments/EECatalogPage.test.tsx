import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EECatalogPage } from './EECatalogPage';
import styles from './EECatalogPage.module.css';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/content/ee',
}));

jest.mock('@ansible/portal-plugin-sdk', () => ({
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
  NotificationStack: () => null,
  useNotifications: () => ({ notifications: [], removeNotification: () => {} }),
  useIsSuperuser: () => ({ isSuperuser: false }),
}));

jest.mock('./DefinitionFilesCatalogPage', () => ({
  DefinitionFilesCatalogPage: () => 'Mocked definition files',
}));
jest.mock('./CreateContent', () => ({ CreateContent: () => null }));
jest.mock('./ImagesCatalogPage', () => ({ ImagesCatalogPage: () => null }));
jest.mock('./RegistrySyncButton', () => ({ RegistrySyncButton: () => null }));
jest.mock('./catalog/ImageSyncDialog', () => ({ ImageSyncDialog: () => null }));

it('wraps the shared execution-environment page in a full-height themed surface', () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/content/ee/catalog']}>
      <EECatalogPage view="catalog" />
    </MemoryRouter>,
  );

  const frame = container.querySelector('[data-testid="ee-catalog-frame"]');
  const surface = container.querySelector('[data-testid="ee-catalog-surface"]');

  expect(frame).toBeTruthy();
  expect(surface).toBeTruthy();
  expect(surface?.classList.contains('bui-Box')).toBe(true);
  expect(surface?.classList.contains(styles.pageSurface)).toBe(true);
  expect(surface?.hasAttribute('data-bg')).toBe(false);
  expect(container.querySelector('.bui-Container')).toBeNull();
  expect(
    screen.getByRole('heading', { name: 'Execution Environments' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('tab', { name: 'Execution environments' }),
  ).toBeTruthy();
  expect(screen.getByText('Mocked definition files')).toBeTruthy();
});
