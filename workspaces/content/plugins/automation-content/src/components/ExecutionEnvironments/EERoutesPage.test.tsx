import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import {
  mockApis,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import {
  automationContentApiRef,
  ContentApiError,
  type ArtifactContents,
  type AutomationContentApi,
} from '../../api';
import { createDemoApi } from '../../development/demoApi';
import { demoImageRef } from '../../development/fixtures';
import { EERoutesPage } from './EERoutesPage';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/content/ee',
}));

jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useStarredEntities: () => ({
    isStarredEntity: () => false,
    toggleStarredEntity: jest.fn(),
  }),
}));

jest.mock('./EECatalogPage', () => ({
  EECatalogPage: () => <div>Image catalog route</div>,
}));

function createLiveApi(): AutomationContentApi {
  const enumeration = {
    status: 'unknown' as const,
    source: 'external-introspection' as const,
  };
  return {
    listRegistries: async () => [],
    listExecutionEnvironments: async () => ({
      items: [],
      page: 1,
      totalItems: 0,
      next: null,
    }),
    getExecutionEnvironment: async () => {
      throw new ContentApiError(404, 'No live demo fixture.');
    },
    getContents: async (): Promise<ArtifactContents> => ({
      enumeration,
      collections: [],
      items: [],
    }),
    listCollections: async () => [],
    searchContentItems: async () => ({ items: [], totalItems: 0 }),
    getContentItem: async fqcn => {
      throw new ContentApiError(404, `No live content item ${fqcn}.`);
    },
    syncAll: async () => ({
      status: 'completed',
      durationMs: 0,
      registries: [],
    }),
    syncRegistry: async () => ({
      status: 'completed',
      discovered: 0,
      retainedPrevious: false,
    }),
  };
}

async function renderDemoRoute(path: string): Promise<void> {
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [automationContentApiRef, createDemoApi(createLiveApi())],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        [permissionApiRef, mockApis.permission()],
      ]}
    >
      <Routes>
        <Route path="/content/ee/*" element={<EERoutesPage />} />
      </Routes>
    </TestApiProvider>,
    { routeEntries: [path] },
  );
}

const demoItemPath = `/content/ee/${encodeURIComponent(
  demoImageRef(0),
)}?tab=content&item=ansible.posix.mount`;

it('renders the catalog route without demo warnings', async () => {
  await renderDemoRoute('/content/ee/images');

  expect(await screen.findByText('Image catalog route')).toBeTruthy();
  expect(
    screen.queryByText(
      'Demo examples are mixed with real registry images. Rows marked Demo use simulated source and sync information.',
    ),
  ).toBeNull();
});

it('renders deep content documentation without demo warnings', async () => {
  await renderDemoRoute(demoItemPath);

  expect(
    await screen.findByRole('heading', { name: 'ansible.posix.mount' }),
  ).toBeTruthy();
  expect(
    screen.queryByText(
      'Demo examples are mixed with real registry images. Rows marked Demo use simulated source and sync information.',
    ),
  ).toBeNull();
});
