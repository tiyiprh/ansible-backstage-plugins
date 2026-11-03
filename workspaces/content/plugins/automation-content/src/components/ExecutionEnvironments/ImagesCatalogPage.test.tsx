import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import type { Entity } from '@backstage/catalog-model';
import {
  automationContentApiRef,
  ContentApiError,
  type ArtifactContents,
  type AutomationContentApi,
  type ExecutionEnvironment,
} from '../../api';
import { createDemoApi } from '../../development/demoApi';
import { demoImageRef } from '../../development/fixtures';
import { ImagesCatalogPage } from './ImagesCatalogPage';
import { EEDetailsPage } from './EEDetailsPage';

const mockIsStarredEntity = jest.fn((_entity: Entity) => false);
const mockToggleStarredEntity = jest.fn();
let entityStarred = false;

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/content/ee',
}));
jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useStarredEntities: () => ({
    isStarredEntity: (entity: Entity) =>
      mockIsStarredEntity(entity) || entityStarred,
    toggleStarredEntity: (entity: Entity) => {
      mockToggleStarredEntity(entity);
      entityStarred = !entityStarred;
    },
  }),
}));

beforeEach(() => {
  mockIsStarredEntity.mockReset().mockReturnValue(false);
  mockToggleStarredEntity.mockReset();
  entityStarred = false;
});

beforeAll(() => {
  const cssApi = globalThis.CSS ?? ({} as typeof CSS);
  if (!cssApi.escape) {
    cssApi.escape = value => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: cssApi,
  });
});

const base: ExecutionEnvironment = {
  ref: 'r/repo@sha256:one',
  registry: 'r',
  repository: 'repo',
  digest: 'sha256:one',
  tags: ['latest'],
  pullReference: 'r/repo@sha256:one',
  contentsKnown: true,
  enumeration: { status: 'partial', source: 'labels' },
  counts: { collections: 2, plugins: 3 },
  collections: [],
};

const linkedEntity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'automation-team',
    annotations: {
      'ansible.com/registry': 'r',
      'ansible.com/repository': 'repo',
      'ansible.com/digest': 'sha256:one',
    },
  },
};

const envelope = (
  items: ExecutionEnvironment[],
  page = 1,
  totalItems = items.length,
  pageSize = 10,
) => ({
  items,
  page,
  totalItems,
  pageSize,
  next: page * pageSize < totalItems ? `?page=${page + 1}` : null,
});

function createLiveApi(image?: ExecutionEnvironment): {
  api: AutomationContentApi;
  syncRegistry: jest.Mock;
} {
  const enumeration = {
    status: 'unknown' as const,
    source: 'external-introspection' as const,
  };
  const syncRegistry = jest.fn(async (_registry: string) => ({
    status: 'completed' as const,
    discovered: 0,
    retainedPrevious: false,
  }));
  const api: AutomationContentApi = {
    listRegistries: async () => [],
    listExecutionEnvironments: async ({ page = 1 } = {}) => ({
      items: page === 1 && image ? [image] : [],
      page,
      totalItems: image ? 1 : 0,
      next: null,
    }),
    getExecutionEnvironment: async ref => {
      if (image && ref === image.ref) return image;
      throw new ContentApiError(404, 'Not found');
    },
    getContents: async (): Promise<ArtifactContents> => ({
      enumeration,
      collections: [],
      items: [],
    }),
    listCollections: async () => [],
    searchContentItems: async () => ({ items: [], totalItems: 0 }),
    getContentItem: async fqcn => {
      throw new ContentApiError(404, `No demo doc for ${fqcn}`);
    },
    syncAll: async () => ({
      status: 'completed',
      durationMs: 0,
      registries: [],
    }),
    syncRegistry,
  };
  return { api, syncRegistry };
}

it('does not describe a failed inventory request as empty', async () => {
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: async () => {
              throw new Error('offline');
            },
          },
        ],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(screen.queryByText('0 images loaded')).toBeNull();
  expect(screen.queryByText('No execution environments discovered')).toBeNull();
});

it('defaults to classified EEs and refetches everything when toggled', async () => {
  const listExecutionEnvironments = jest.fn(async () => envelope([base]));
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, { listExecutionEnvironments }],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(await screen.findByRole('link', { name: 'repo' })).toBeTruthy();
  expect(screen.queryByRole('columnheader', { name: 'Digest' })).toBeNull();
  expect(
    screen.queryByRole('columnheader', { name: 'Tags / digest' }),
  ).toBeNull();
  expect(screen.queryByText(base.digest.slice(0, 19))).toBeNull();
  expect(screen.queryByText('latest')).toBeNull();
  expect(screen.queryByText('Untagged')).toBeNull();
  expect(
    screen.getByRole('heading', { name: 'Execution environment images (1)' }),
  ).toBeTruthy();
  expect(listExecutionEnvironments).toHaveBeenLastCalledWith({
    allTypes: false,
    page: 1,
    perPage: 10,
  });
  await userEvent.click(screen.getByRole('checkbox', { name: /all images/ }));
  expect(listExecutionEnvironments).toHaveBeenLastCalledWith({
    allTypes: true,
    page: 1,
    perPage: 10,
  });
});

it('retains search controls when no images match and clears the filters', async () => {
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          { listExecutionEnvironments: async () => envelope([base]) },
        ],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(await screen.findByRole('link', { name: 'repo' })).toBeTruthy();
  await userEvent.type(
    screen.getByRole('searchbox', { name: 'Search images' }),
    'absent',
  );
  expect(
    await screen.findByText('No images match your search or filters'),
  ).toBeTruthy();
  await userEvent.click(
    screen.getByRole('button', { name: 'Clear search and filters' }),
  );
  expect(await screen.findByRole('link', { name: 'repo' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Sync|Build|Edit/ })).toBeNull();
});

it('uses server totals, fetches page 2 and resets pagination when all types change', async () => {
  const listExecutionEnvironments = jest.fn(
    async ({ page }: { page: number }) =>
      envelope(
        Array.from({ length: 10 }, (_, index) => ({
          ...base,
          ref: `r/repo@sha256:${page}-${index}`,
          digest: `sha256:${page}-${index}`,
          repository: `repo-${page}-${index}`,
        })),
        page,
        26,
      ),
  );
  const getEntities = jest.fn(async () => ({ items: [] }));
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, { listExecutionEnvironments }],
        [catalogApiRef, { getEntities }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(await screen.findByText('1 - 10 of 26')).toBeTruthy();
  await waitFor(() =>
    expect(getEntities).toHaveBeenLastCalledWith({
      filter: {
        kind: 'Component',
        'metadata.annotations.ansible.com/digest': Array.from(
          { length: 10 },
          (_, index) => `sha256:1-${index}`,
        ),
      },
    }),
  );
  expect(
    screen.getByRole('button', { name: /Select table page size/ }),
  ).toBeTruthy();
  await userEvent.click(
    screen.getByRole('button', { name: 'Next table page' }),
  );
  expect(await screen.findByText('11 - 20 of 26')).toBeTruthy();
  expect(listExecutionEnvironments).toHaveBeenLastCalledWith({
    allTypes: false,
    page: 2,
    perPage: 10,
  });
  expect(await screen.findByRole('link', { name: 'repo-2-0' })).toBeTruthy();
  await waitFor(() =>
    expect(getEntities).toHaveBeenLastCalledWith({
      filter: {
        kind: 'Component',
        'metadata.annotations.ansible.com/digest': Array.from(
          { length: 10 },
          (_, index) => `sha256:2-${index}`,
        ),
      },
    }),
  );
  await userEvent.click(screen.getByRole('checkbox', { name: /all images/ }));
  await waitFor(() =>
    expect(listExecutionEnvironments).toHaveBeenLastCalledWith({
      allTypes: true,
      page: 1,
      perPage: 10,
    }),
  );
  expect(await screen.findByText('1 - 10 of 26')).toBeTruthy();
});

it('keeps favorites filtering on the current page', async () => {
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          { listExecutionEnvironments: async () => envelope([base]) },
        ],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(await screen.findByText('1 - 1 of 1')).toBeTruthy();
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Favorites only' }),
  );
  expect(
    await screen.findByText('No images match your search or filters'),
  ).toBeTruthy();
  await userEvent.click(
    screen.getByRole('button', { name: 'Clear search and filters' }),
  );
  expect(await screen.findByRole('link', { name: 'repo' })).toBeTruthy();
});

it('offers supported page sizes and resets to page one when the size changes', async () => {
  const listExecutionEnvironments = jest.fn(
    async ({ page, perPage }: { page: number; perPage: number }) =>
      envelope([base], page, 60, perPage),
  );
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, { listExecutionEnvironments }],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  await screen.findByText('1 - 10 of 60');
  await userEvent.click(
    screen.getByRole('button', { name: 'Next table page' }),
  );
  await screen.findByText('11 - 20 of 60');
  const pageSizeSelect = document.querySelector<HTMLSelectElement>(
    'select[name="pageSize"]',
  )!;
  expect(
    Array.from(pageSizeSelect.options)
      .map(option => option.value)
      .filter(Boolean),
  ).toEqual(['10', '20', '50']);
  fireEvent.change(pageSizeSelect, { target: { value: '20' } });
  await waitFor(() =>
    expect(listExecutionEnvironments).toHaveBeenLastCalledWith({
      allTypes: false,
      page: 1,
      perPage: 20,
    }),
  );
  expect(await screen.findByText('1 - 20 of 60')).toBeTruthy();
  expect(screen.getByText('1 images loaded')).toBeTruthy();
});

it('skips the catalog request for an empty page', async () => {
  const getEntities = jest.fn(async () => ({ items: [] }));
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          { listExecutionEnvironments: async () => envelope([]) },
        ],
        [catalogApiRef, { getEntities }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  await screen.findByText('0 images loaded');
  expect(getEntities).not.toHaveBeenCalled();
});

it('keeps inventory visible when the filtered catalog request fails', async () => {
  const getEntities = jest.fn(async () => {
    throw new Error('offline');
  });
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          { listExecutionEnvironments: async () => envelope([base]) },
        ],
        [catalogApiRef, { getEntities }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  await screen.findByText(
    'Catalog links are unavailable. Favorites may be missing.',
  );
  expect(screen.getByRole('link', { name: 'repo' })).toBeTruthy();
});

it('preserves precise matching and favorites for shared digests', async () => {
  mockIsStarredEntity.mockImplementation(
    entity => entity.metadata.name === linkedEntity.metadata.name,
  );
  const other = { ...base, ref: 'r/other@sha256:one', repository: 'other' };
  const getEntities = jest.fn(async () => ({ items: [linkedEntity] }));
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          { listExecutionEnvironments: async () => envelope([base, other]) },
        ],
        [catalogApiRef, { getEntities }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  await screen.findByRole('link', { name: 'repo' });
  await waitFor(() =>
    expect(mockIsStarredEntity).toHaveBeenCalledWith(linkedEntity),
  );
  expect(getEntities).toHaveBeenCalledTimes(1);
  expect(getEntities).toHaveBeenCalledWith({
    filter: {
      kind: 'Component',
      'metadata.annotations.ansible.com/digest': [base.digest],
    },
  });
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Favorites only' }),
  );
  expect(screen.getByRole('link', { name: 'repo' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'other' })).toBeNull();
});

it('keeps search and the all-images toggle without the facet rail', async () => {
  const { container } = render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: async () => envelope([base]),
          },
        ],
        [
          catalogApiRef,
          { getEntities: async () => ({ items: [linkedEntity] }) },
        ],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );

  expect(await screen.findByRole('link', { name: 'repo' })).toBeTruthy();
  expect(screen.getByRole('searchbox', { name: 'Search images' })).toBeTruthy();
  expect(
    screen.getByRole('checkbox', { name: 'Show all images' }),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Filter by/ })).toBeNull();
  expect(container.querySelectorAll('select')).toHaveLength(1);
  expect(screen.getByRole('columnheader', { name: 'Status' })).toBeTruthy();
  expect(screen.getByText('R')).toBeTruthy();
  expect(screen.getByText('External registry')).toBeTruthy();
  expect(screen.getByText('Syncing')).toBeTruthy();
});

it('shows the star toggle and reviewed row actions, including the unavailable controller action', async () => {
  const scaffold = jest.fn().mockRejectedValue(new Error('template not found'));
  const syncRegistry = jest
    .fn()
    .mockRejectedValue(new ContentApiError(403, 'Forbidden'));
  const { rerender } = render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: async () => envelope([base]),
            syncRegistry,
          },
        ],
        [
          catalogApiRef,
          { getEntities: async () => ({ items: [linkedEntity] }) },
        ],
        [scaffolderApiRef, { scaffold }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );

  await screen.findByRole('link', { name: 'repo' });
  await userEvent.click(
    screen.getByRole('button', { name: 'Add repo to favorites' }),
  );
  expect(mockToggleStarredEntity).toHaveBeenCalledWith(linkedEntity);
  rerender(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: async () => envelope([base]),
            syncRegistry,
          },
        ],
        [
          catalogApiRef,
          { getEntities: async () => ({ items: [linkedEntity] }) },
        ],
        [scaffolderApiRef, { scaffold }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(
    screen
      .getByRole('button', { name: 'Remove repo from favorites' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  expect(
    screen.getByRole('menuitem', { name: 'Use in Controller' }),
  ).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: 'Sync' })).toBeTruthy();
  expect(
    screen.queryByRole('menuitem', { name: 'Copy pull reference' }),
  ).toBeNull();
  expect(screen.getByRole('menuitem', { name: 'View details' })).toBeTruthy();
  expect(screen.queryByRole('menuitem', { name: /favorite/i })).toBeNull();

  await userEvent.click(
    screen.getByRole('menuitem', { name: 'Use in Controller' }),
  );
  expect(await screen.findByRole('dialog')).toBeTruthy();
  expect(
    screen.getByRole('textbox', { name: 'Execution environment name' }),
  ).toHaveProperty('value', 'repo');
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in Controller' }),
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    'This action is not available yet. The task template was not found.',
  );
  expect(scaffold).toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  await userEvent.click(screen.getByRole('menuitem', { name: 'Sync' }));
  expect(syncRegistry).toHaveBeenCalledWith('r');
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Sync access needed for R.',
  );
});

it('labels partial counts and unknown contents without requiring catalog matches', async () => {
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: async () =>
              envelope([
                base,
                {
                  ...base,
                  ref: 'r/repo@sha256:two',
                  digest: 'sha256:two',
                  contentsKnown: false,
                  enumeration: { status: 'unknown', source: 'labels' },
                },
              ]),
          },
        ],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(
    await screen.findByText('Approximate: 2 collections / 3 plugins'),
  ).toBeTruthy();
  // The fidelity column is gone; the Contents cell alone carries the label.
  expect(screen.getAllByText('Contents unknown')).toHaveLength(1);
  // The enumeration source ('labels') no longer renders with the fidelity
  // column gone; the Contents summary alone carries the nuance.
  expect(screen.queryByRole('button', { name: /to favorites/ })).toBeNull();
  expect(
    screen.getAllByRole('link', { name: 'repo' })[0].getAttribute('href'),
  ).toContain('r%2Frepo%40sha256%3Aone');
});

it('skips the catalog query when the page contains only demo images', async () => {
  const getEntities = jest.fn(async () => ({ items: [] }));
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, createDemoApi(createLiveApi().api)],
        [catalogApiRef, { getEntities }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );

  expect(await screen.findByText('7 images loaded')).toBeTruthy();
  expect(getEntities).not.toHaveBeenCalled();
});

it('shows all demo sync states beside a live row and safely opens demo details', async () => {
  const realImage: ExecutionEnvironment = {
    ...base,
    ref: 'quay.io/live/automation-ee@sha256:ffffffffffffffffffffffffffffffff',
    registry: 'quay.io',
    repository: 'live/automation-ee',
    definitionEntityRef: 'component:default/networking-ee',
    digest: 'sha256:ffffffffffffffffffffffffffffffff',
    pullReference:
      'quay.io/live/automation-ee@sha256:ffffffffffffffffffffffffffffffff',
    lastReconciledAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    lastReconcileOk: true,
  };
  const live = createLiveApi(realImage);
  const demoApi = createDemoApi(live.api);
  const demoRef = demoImageRef(0);
  const getEntities = jest.fn(async () => ({ items: [] }));
  const scaffold = jest.fn();
  const { unmount } = render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, demoApi],
        [catalogApiRef, { getEntities }],
        [scaffolderApiRef, { scaffold }],
      ]}
    >
      <MemoryRouter initialEntries={['/content/ee/images']}>
        <Routes>
          <Route path="/content/ee/images" element={<ImagesCatalogPage />} />
          <Route path="/content/ee/:ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );

  expect(
    await screen.findByRole('link', { name: 'demo/utopia-available' }),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'live/automation-ee' })).toBeTruthy();
  expect(screen.getByText('Syncing')).toBeTruthy();
  expect(screen.getAllByText('Stale')).toHaveLength(2);
  expect(screen.getByText('Failed')).toBeTruthy();
  expect(screen.getAllByText('Available').length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText('3 days ago')).toBeTruthy();
  expect(screen.getByText('2 hours ago')).toBeTruthy();
  expect(screen.getByText('Never reconciled')).toBeTruthy();
  expect(screen.getAllByText('Definition file')).toHaveLength(2);
  expect(screen.queryByText('Proposed demo source')).toBeNull();
  expect(screen.queryByText('Demo')).toBeNull();
  expect(
    screen.queryByText(
      /Proposed source|Synthetic development preview|Registry sync is disabled/,
    ),
  ).toBeNull();
  expect(screen.getAllByText('External registry').length).toBeGreaterThan(0);
  expect(
    screen.queryByRole('columnheader', { name: 'Tags / digest' }),
  ).toBeNull();
  await waitFor(() =>
    expect(getEntities).toHaveBeenCalledWith({
      filter: {
        kind: 'Component',
        'metadata.annotations.ansible.com/digest': [realImage.digest],
      },
    }),
  );

  expect(
    screen
      .getByRole('link', { name: 'demo/utopia-available' })
      .getAttribute('href'),
  ).toContain(encodeURIComponent(demoRef));
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for demo/utopia-available' }),
  );
  expect(
    screen
      .getByRole('menuitem', { name: 'Sync' })
      .getAttribute('aria-disabled'),
  ).toBe('true');
  expect(
    screen
      .getByRole('menuitem', { name: 'Use in Controller' })
      .getAttribute('aria-disabled'),
  ).toBe('true');
  unmount();

  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, demoApi],
        [catalogApiRef, { getEntities }],
        [scaffolderApiRef, { scaffold }],
      ]}
    >
      <MemoryRouter
        initialEntries={[`/content/ee/${encodeURIComponent(demoRef)}`]}
      >
        <Routes>
          <Route path="/content/ee/:ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(
    await screen.findByRole('heading', { name: 'demo/utopia-available' }),
  ).toBeTruthy();
  expect(screen.queryByText('Demo')).toBeNull();
  expect(
    screen.queryByText(
      /Proposed source|Synthetic development preview|Registry sync is disabled/,
    ),
  ).toBeNull();
  expect(screen.getByText('External registry')).toBeTruthy();
  expect(
    screen.queryByText(
      'Synthetic development preview: available. No registry operation is running; inventory is empty or unknown.',
    ),
  ).toBeNull();
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for demo/utopia-available' }),
  );
  expect(
    screen
      .getByRole('menuitem', { name: 'Use in Controller' })
      .getAttribute('aria-disabled'),
  ).toBe('true');
  expect(
    screen
      .getByRole('menuitem', { name: 'Sync' })
      .getAttribute('aria-disabled'),
  ).toBe('true');
  expect(screen.queryByRole('menuitem', { name: 'Favorite' })).toBeNull();
  await userEvent.click(
    screen.getByRole('menuitem', { name: 'Use in Controller' }),
  );
  expect(
    screen.queryByRole('textbox', { name: 'Execution environment name' }),
  ).toBeNull();
  expect(scaffold).not.toHaveBeenCalled();
  expect(live.syncRegistry).not.toHaveBeenCalled();
  expect(mockToggleStarredEntity).not.toHaveBeenCalled();
  expect(getEntities).toHaveBeenCalledTimes(1);
});
