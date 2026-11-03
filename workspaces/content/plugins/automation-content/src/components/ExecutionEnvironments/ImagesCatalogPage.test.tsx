import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import { automationContentApiRef, type ExecutionEnvironment } from '../../api';
import { ImagesCatalogPage } from './ImagesCatalogPage';

const mockIsStarredEntity = jest.fn((_entity: Entity) => false);
const mockToggleStarredEntity = jest.fn();

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/content/ee',
}));
jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useStarredEntities: () => ({
    isStarredEntity: (entity: Entity) => mockIsStarredEntity(entity),
    toggleStarredEntity: (entity: Entity) => mockToggleStarredEntity(entity),
  }),
}));

beforeEach(() => {
  mockIsStarredEntity.mockReset().mockReturnValue(false);
  mockToggleStarredEntity.mockReset();
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
  expect(
    screen.getByRole('heading', { name: 'Execution Environments images (1)' }),
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
  expect(await screen.findByText('No images match your filters')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
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
  expect(await screen.findByText('No images match your filters')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
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

it('renders source, source-type, status, and content facets', async () => {
  const second: ExecutionEnvironment = {
    ...base,
    ref: 'other/second@sha256:two',
    registry: 'other',
    repository: 'second',
    digest: 'sha256:two',
    tags: ['stable'],
  };
  const unlinked: ExecutionEnvironment = {
    ...base,
    ref: 'orphan/orphan@sha256:three',
    registry: 'orphan',
    repository: 'orphan',
    digest: 'sha256:three',
    tags: ['orphan'],
  };
  const { container } = render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: async () =>
              envelope([base, second, unlinked]),
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
  expect(screen.getByRole('columnheader', { name: 'Source' })).toBeTruthy();
  expect(
    screen.getByRole('button', { name: /Filter by source$/ }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: /Filter by source type/ }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: /Filter by status/ })).toBeTruthy();
  expect(
    screen.getByRole('button', { name: /Filter by content/ }),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Filter by tag/ })).toBeNull();
  expect(screen.queryByRole('columnheader', { name: 'Owner' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Filter by owner/ })).toBeNull();

  const facets = container.querySelectorAll('select');
  fireEvent.change(facets[0], { target: { value: 'r' } });
  await waitFor(() =>
    expect(screen.queryByRole('link', { name: 'second' })).toBeNull(),
  );
  expect(screen.getByRole('link', { name: 'repo' })).toBeTruthy();
});

it('filters by content state on the current page', async () => {
  const unknown: ExecutionEnvironment = {
    ...base,
    ref: 'r/other@sha256:two',
    repository: 'other',
    digest: 'sha256:two',
    contentsKnown: false,
    enumeration: { status: 'unknown', source: 'external-introspection' },
  };
  const { container } = render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: jest.fn(async () =>
              envelope([base, unknown]),
            ),
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

  await screen.findByRole('link', { name: 'repo' });
  expect(screen.getByRole('link', { name: 'other' })).toBeTruthy();
  // Rail select order: source, source type, status, content.
  const contentSelect = container.querySelectorAll('select')[3];
  fireEvent.change(contentSelect, { target: { value: 'unknown' } });
  expect(await screen.findByRole('link', { name: 'other' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'repo' })).toBeNull();
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
