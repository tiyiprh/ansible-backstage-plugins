import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import yaml from 'js-yaml';
import {
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { scmAuthApiRef } from '@backstage/integration-react';
import { NotificationProvider } from '@ansible/portal-plugin-sdk';
import type { Entity } from '@backstage/catalog-model';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { MemoryRouter } from 'react-router-dom';
import { DefinitionFilesCatalogPage } from './DefinitionFilesCatalogPage';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef:
    () => (params?: { namespace?: string; kind?: string; name?: string }) =>
      params
        ? `/catalog/${params.namespace}/${params.kind}/${params.name}`
        : '/content/ee',
}));
jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useStarredEntities: () => ({
    starredEntities: new Set<string>(),
    isStarredEntity: () => false,
    toggleStarredEntity: jest.fn(),
  }),
}));

beforeAll(() => {
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: { escape: (value: string) => value },
  });
});

const definition: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'web-ee',
    namespace: 'default',
    uid: 'definition-uid',
    title: 'Web execution environment',
    description: 'A definition for web automation.',
    tags: ['linux', 'web'],
  },
  spec: { type: 'execution-environment', owner: 'group:default/platform' },
};

const networkingSeed = yaml.load(
  readFileSync(
    resolve(__dirname, '../../../dev/fixtures/networking-ee.catalog.yaml'),
    'utf8',
  ),
) as Entity;

function hasDigestExclusion(query: unknown): boolean {
  if (typeof query !== 'object' || query === null || !('$not' in query)) {
    return false;
  }
  const notPredicate = query.$not;
  if (
    typeof notPredicate !== 'object' ||
    notPredicate === null ||
    !('metadata.annotations.ansible.com/digest' in notPredicate)
  ) {
    return false;
  }
  const digestPredicate =
    notPredicate['metadata.annotations.ansible.com/digest'];
  return (
    typeof digestPredicate === 'object' &&
    digestPredicate !== null &&
    '$exists' in digestPredicate &&
    digestPredicate.$exists === true
  );
}

function renderPage(
  getEntities: () => Promise<{ items: Entity[] }> = async () => ({
    items: [definition],
  }),
) {
  const queryEntities = jest.fn(
    async (
      request: { query?: unknown; limit?: number; offset?: number } = {},
    ) => {
      const response = await getEntities();
      const filteredItems = hasDigestExclusion(request.query)
        ? response.items.filter(
            entity =>
              entity.metadata.annotations?.['ansible.com/digest'] === undefined,
          )
        : response.items;
      const offset = request.offset ?? 0;
      const limit = request.limit ?? filteredItems.length;
      return {
        items: filteredItems.slice(offset, offset + limit),
        totalItems: filteredItems.length,
        pageInfo: {},
      };
    },
  );
  const view = render(
    <TestApiProvider
      apis={[
        [
          catalogApiRef,
          {
            getEntities,
            queryEntities,
            getEntityFacets: async () => ({ facets: {} }),
            getEntitiesByRefs: async () => ({
              items: [
                {
                  apiVersion: 'backstage.io/v1alpha1',
                  kind: 'Group',
                  metadata: { name: 'platform' },
                },
              ],
            }),
            removeEntityByUid: jest.fn(),
          },
        ],
        [scmAuthApiRef, { getCredentials: jest.fn() }],
        [configApiRef, mockApis.config()],
        [discoveryApiRef, mockApis.discovery()],
        [
          fetchApiRef,
          {
            fetch: jest.fn(
              async (
                _input: RequestInfo | URL,
                _init?: RequestInit,
              ): Promise<Response> => new Response('', { status: 404 }),
            ),
          },
        ],
        [identityApiRef, mockApis.identity()],
      ]}
    >
      <MemoryRouter>
        <NotificationProvider>
          <DefinitionFilesCatalogPage />
        </NotificationProvider>
      </MemoryRouter>
    </TestApiProvider>,
  );
  return { ...view, queryEntities };
}

it('renders entity-backed definition columns and metadata', async () => {
  renderPage();
  expect(
    await screen.findByRole('heading', {
      name: 'Execution Environments definition files (1)',
    }),
  ).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeTruthy();
  expect(
    screen.getByRole('columnheader', { name: 'Description' }),
  ).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Tags' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'web-ee' }).getAttribute('href'),
  ).toBe('/content/ee/catalog/default/web-ee');
  expect(await screen.findByText('platform')).toBeTruthy();
});

it('encodes non-default definition entity refs in the local details route', async () => {
  const namespacedDefinition: Entity = {
    ...definition,
    metadata: {
      ...definition.metadata,
      name: 'web-ee+staging',
      namespace: 'team+one',
    },
  };
  renderPage(async () => ({ items: [namespacedDefinition] }));

  expect(
    await screen.findByRole('link', { name: 'web-ee+staging' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'web-ee+staging' }).getAttribute('href'),
  ).toBe('/content/ee/catalog/team%2Bone/web-ee%2Bstaging');
});

it('excludes registry-backed images with the catalog provider digest annotation', async () => {
  const registryImage: Entity = {
    ...definition,
    metadata: {
      ...definition.metadata,
      name: 'registry-demo-utopia-ee',
      title: 'demo/utopia-ee:latest',
      description: 'Execution environment with 2 collections',
      tags: ['execution-environment'],
      annotations: {
        'ansible.com/registry': 'demo-registry',
        'ansible.com/repository': 'demo/utopia-ee',
        'ansible.com/digest': 'sha256:0123456789abcdef',
        'ansible.com/pull-reference':
          'registry.example/demo/utopia-ee@sha256:0123456789abcdef',
      },
    },
    spec: {
      type: 'execution-environment',
      lifecycle: 'production',
      owner: 'group:default/platform',
      dependsOn: [],
    },
  };
  const emptyDigestImage: Entity = {
    ...registryImage,
    metadata: {
      ...registryImage.metadata,
      name: 'registry-empty-digest',
      annotations: {
        ...registryImage.metadata.annotations,
        'ansible.com/digest': '',
      },
    },
  };
  const { queryEntities } = renderPage(async () => ({
    items: [definition, networkingSeed, registryImage, emptyDigestImage],
  }));

  expect(
    await screen.findByRole('heading', {
      name: 'Execution Environments definition files (2)',
    }),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'web-ee' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'networking-ee' })).toBeTruthy();
  expect(
    screen.queryByRole('link', { name: 'registry-demo-utopia-ee' }),
  ).toBeNull();
  expect(
    screen.queryByRole('link', { name: 'registry-empty-digest' }),
  ).toBeNull();
  expect(queryEntities).toHaveBeenCalledWith(
    expect.objectContaining({
      query: {
        $not: {
          'metadata.annotations.ansible.com/digest': { $exists: true },
        },
      },
    }),
  );
});

it('gates row actions by annotations and buildability', async () => {
  renderPage();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Actions for web-ee' }),
  );
  expect(screen.queryByRole('menuitem', { name: 'Build' })).toBeNull();
  expect(
    screen.getByRole('menuitem', { name: 'Edit definition' }),
  ).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: 'View in source' })).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeTruthy();
});

it('shows the prototype first-run call to action for an empty catalog', async () => {
  renderPage(async () => ({ items: [] }));
  expect(
    await screen.findByRole('heading', {
      name: 'No Execution Environment definition files, yet',
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', {
      name: 'Create Execution Environment definition file',
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', {
      name: 'How to build and use Execution Environment from definition files',
    }),
  ).toBeTruthy();
});
