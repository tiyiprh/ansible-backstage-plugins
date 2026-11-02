import { screen } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import plugin from './alpha';
import { useParams } from 'react-router-dom';

jest.mock('@ansible/portal-plugin-sdk', () => ({
  ...jest.requireActual('@ansible/portal-plugin-sdk'),
  useSyncStatusPolling: () => ({
    isSyncInProgress: false,
    syncProgress: [],
    startTracking: jest.fn(),
  }),
  useIsSuperuser: () => ({ isSuperuser: false }),
}));

// Route discovery is independent of registry/catalog networking, covered by page tests.
jest.mock('./components/ExecutionEnvironments/ImagesCatalogPage', () => ({
  ImagesCatalogPage: () => <h1>Execution environments</h1>,
}));
jest.mock('./components/ExecutionEnvironments/EECatalogPage', () => ({
  EECatalogPage: () => <h1>Execution Environments</h1>,
}));
jest.mock('./components/CollectionsCatalog/CollectionsCatalogPage', () => ({
  CollectionsCatalogPage: () => <h1>Collections</h1>,
}));
jest.mock('./components/CollectionsCatalog/CollectionDetailsPage', () => ({
  CollectionDetailsPage: () => {
    const { namespace, name } = useParams();
    return (
      <h1>
        Collection details {namespace}.{name}
      </h1>
    );
  },
}));
jest.mock('./components/ExecutionEnvironments/EEDetailsPage', () => ({
  EEDetailsPage: () => {
    const { ref } = useParams();
    return <h1>EE details {ref}</h1>;
  },
}));

it.each([
  ['/content', 'Execution Environments'],
  ['/content/ee', 'Execution Environments'],
  ['/automation-content', 'Execution Environments'],
  ['/automation-content/execution-environments', 'Execution Environments'],
  ['/automation-content/collections', 'Collections'],
  ['/content/collections', 'Collections'],
  [
    '/content/collections/ns/name_with.dots',
    'Collection details ns.name_with.dots',
  ],
  [
    '/automation-content/execution-environments/registry%2Fdemo%40sha256%3A123',
    'EE details registry/demo@sha256:123',
  ],
  [
    '/automation-content/collections/ns/name_with.dots',
    'Collection details ns.name_with.dots',
  ],
])('discovers the native page at %s', async (path, text) => {
  await renderTestApp({ features: [plugin], initialRouteEntries: [path] });
  expect(await screen.findByText(text, {}, { timeout: 10000 })).toBeTruthy();
});
