import type { Entity } from '@backstage/catalog-model';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { DefinitionFileDetailsPage } from './DefinitionFileDetailsPage';
import { EERoutesPage } from './EERoutesPage';

// Permission policy and the code snippet's clipboard integration are tested separately.
jest.mock('../common/RequiresContentPermission', () => ({
  RequiresContentPermission: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('@backstage/core-components', () => ({
  ...jest.requireActual('@backstage/core-components'),
  CodeSnippet: ({ text }: { text: string }) => <pre>{text}</pre>,
}));
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
jest.mock('./catalog/useEEBuildFlow', () => ({
  useEEBuildFlow: () => ({ authBusy: false, dialogOpen: false }),
}));
jest.mock('./catalog/EEBuildDialog', () => ({ EEBuildDialog: () => null }));
jest.mock('../UnregisterEntityDialog', () => ({
  UnregisterEntityDialog: () => null,
}));
jest.mock('./EECatalogPage', () => ({
  EECatalogPage: () => <div>Catalog route</div>,
}));
jest.mock('./EEDetailsPage', () => ({
  EEDetailsPage: () => <div>Image route</div>,
}));

const validDefinitionYaml = [
  'version: 3',
  'images:',
  '  base_image:',
  '    name: localhost:8445/demo/utopia-ee:latest',
  'dependencies:',
  '  galaxy:',
  '    collections:',
  '      - name: ansible.netcommon',
  '        version: 8.2.0',
  '      - name: ansible.utils',
  '  python:',
  '    - requests>=2.31',
  '    - netaddr',
  '  python_interpreter:',
  '    python_path: /usr/bin/python3.11',
  '  system:',
  '    packages:',
  '      - gcc',
  '      - git',
].join('\n');

beforeAll(() => {
  const cssApi = globalThis.CSS ?? ({} as typeof CSS);
  cssApi.escape ??= value => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: cssApi,
  });
});

function definitionEntity(): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'team-ee', namespace: 'platform' },
    spec: {
      type: 'execution-environment',
      readme: '# Team automation guide',
      definition: validDefinitionYaml,
    },
  };
}

function renderDetails(entity: Entity | undefined, localRoute = false) {
  const getEntityByRef = jest.fn().mockResolvedValue(entity);
  const fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({}),
  });
  render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntityByRef }],
        [discoveryApiRef, { getBaseUrl: async () => '/api/catalog' }],
        [fetchApiRef, { fetch }],
      ]}
    >
      <MemoryRouter initialEntries={['/content/ee/catalog/platform/team-ee']}>
        <Routes>
          <Route
            path={
              localRoute
                ? '/content/ee/*'
                : '/content/ee/catalog/:namespace/:name'
            }
            element={
              localRoute ? <EERoutesPage /> : <DefinitionFileDetailsPage />
            }
          />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  return { getEntityByRef, fetch };
}

it('fetches the namespaced Component and renders its inline content through the local details route', async () => {
  const { getEntityByRef, fetch } = renderDetails(definitionEntity(), true);
  expect(
    await screen.findByRole('heading', { name: 'Team automation guide' }),
  ).toBeTruthy();
  expect(getEntityByRef).toHaveBeenCalledWith('component:platform/team-ee');
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText('localhost:8445/demo/utopia-ee:latest')).toBeTruthy();
  expect(screen.getByText('Collections (2)')).toBeTruthy();
  expect(screen.getByText('ansible.netcommon v8.2.0')).toBeTruthy();
  expect(screen.getByText('ansible.utils')).toBeTruthy();
  expect(screen.getByText('Python requirements (2)')).toBeTruthy();
  expect(screen.getByText('requests>=2.31')).toBeTruthy();
  expect(screen.getByText('netaddr')).toBeTruthy();
  expect(screen.getByText('/usr/bin/python3.11')).toBeTruthy();
  expect(screen.getByText('System packages (2)')).toBeTruthy();
  expect(screen.getByText('gcc')).toBeTruthy();
  expect(screen.getByText('git')).toBeTruthy();
  expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
    'Overview',
  ]);
  expect(
    screen.getByRole('link', { name: 'Definition files' }).getAttribute('href'),
  ).toBe('/content/ee/catalog');
});

it('reads absent inline README and definition through the catalog backend route', async () => {
  const entity = definitionEntity();
  entity.spec = { type: 'execution-environment' };
  entity.metadata.annotations = {
    'backstage.io/source-location':
      'url:https://github.com/ansible/networking-ee/tree/main',
    'ansible.io/scm-provider': 'github',
  };
  const getEntityByRef = jest.fn().mockResolvedValue(entity);
  const fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'https://backstage.example');
    const contents = url.searchParams.get('filePath')?.endsWith('README.md')
      ? '# README from source'
      : 'version: 3\nimages:\n  base_image:\n    name: localhost:8445/demo/utopia-ee:latest';
    return {
      ok: true,
      text: async () => contents,
    };
  });
  render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntityByRef }],
        [discoveryApiRef, { getBaseUrl: async () => '/api/catalog' }],
        [fetchApiRef, { fetch }],
      ]}
    >
      <MemoryRouter initialEntries={['/content/ee/catalog/platform/team-ee']}>
        <Routes>
          <Route
            path="/content/ee/catalog/:namespace/:name"
            element={<DefinitionFileDetailsPage />}
          />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );

  expect(await screen.findByText('README from source')).toBeTruthy();
  expect(
    await screen.findByText(/localhost:8445\/demo\/utopia-ee:latest/),
  ).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.map(([input]) => String(input)).join('\n')).toContain(
    '/ansible/git/file-content?',
  );
});

it('shows unexpanded file references without implying their contents were read', async () => {
  const entity = definitionEntity();
  entity.spec = {
    type: 'execution-environment',
    definition: [
      'version: 3',
      'images:',
      '  base_image:',
      '    name: localhost:8445/demo/utopia-ee:latest',
      'dependencies:',
      '  galaxy: collections.yml',
      '  python: requirements.txt',
      '  system: bindep.txt',
    ].join('\n'),
  };
  const { fetch } = renderDetails(entity);

  expect(await screen.findByText('From file: collections.yml')).toBeTruthy();
  expect(screen.getByText('From file: requirements.txt')).toBeTruthy();
  expect(screen.getByText('From file: bindep.txt')).toBeTruthy();
  expect(screen.queryByText('Collections (0)')).toBeNull();
  expect(screen.queryByText('No additional collections declared.')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it('does not invent defined content for invalid nonempty YAML', async () => {
  const entity = definitionEntity();
  entity.spec = {
    type: 'execution-environment',
    definition: 'version: [not valid',
  };
  renderDetails(entity);

  expect(
    await screen.findByText('Definition file could not be read.'),
  ).toBeTruthy();
  expect(screen.getByText('Base image').parentElement?.textContent).toContain(
    '—',
  );
  expect(screen.queryByText(/Collections \(/)).toBeNull();
});

it.each([undefined, '', '   '])(
  'reports absent inline content honestly (%p)',
  async content => {
    const entity = definitionEntity();
    entity.spec = {
      type: 'execution-environment',
      readme: content,
      definition: content,
    };
    renderDetails(entity);
    expect(await screen.findByText('No README available.')).toBeTruthy();
    expect(screen.getByText('No definition file available.')).toBeTruthy();
    expect(screen.getByText('No description available.')).toBeTruthy();
    expect(
      screen.queryByText('localhost:8445/demo/utopia-ee:latest'),
    ).toBeNull();
  },
);

it.each([
  ['missing entity', undefined],
  ['wrong kind', { ...definitionEntity(), kind: 'Resource' }],
  ['wrong type', { ...definitionEntity(), spec: { type: 'service' } }],
  [
    'wrong namespace',
    {
      ...definitionEntity(),
      metadata: { name: 'team-ee', namespace: 'other' },
    },
  ],
  [
    'wrong name',
    {
      ...definitionEntity(),
      metadata: { name: 'other', namespace: 'platform' },
    },
  ],
] as const)('shows not found for %s', async (_label, entity) => {
  renderDetails(entity);
  expect(await screen.findByText('Definition file not found')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Actions' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'README' })).toBeNull();
});

it('rejects registry-backed execution-environment entities as definition files', async () => {
  const registryImage: Entity = {
    ...definitionEntity(),
    metadata: {
      name: 'team-ee',
      namespace: 'platform',
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

  renderDetails(registryImage);

  expect(await screen.findByText('Definition file not found')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'README' })).toBeNull();
  expect(screen.queryByText('localhost:8445/demo/utopia-ee:latest')).toBeNull();
});

it.each([
  ['missing', undefined],
  ['non-HTTP', 'data:text/plain,unsafe'],
  ['credentials', 'https://user:secret@example.com/catalog-info.yaml'],
  ['malformed', 'not a URL'],
])(
  'hides unsafe or unavailable actions for %s metadata',
  async (_label, url) => {
    const entity = definitionEntity();
    entity.metadata.annotations = url
      ? {
          'backstage.io/edit-url': url,
          'backstage.io/source-location': url,
        }
      : {};
    renderDetails(entity);
    const actions = await screen.findByRole('button', { name: 'Actions' });
    expect(
      screen.queryByRole('button', { name: 'Edit definition' }),
    ).toBeNull();
    await userEvent.click(actions);
    expect(
      await screen.findByRole('menuitem', { name: 'Delete' }),
    ).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Build' })).toBeNull();
    expect(
      screen.queryByRole('menuitem', { name: 'Edit definition' }),
    ).toBeNull();
    expect(
      screen.queryByRole('menuitem', { name: 'View in source' }),
    ).toBeNull();
  },
);

it('exposes edit and source actions for safe HTTP metadata without inventing buildability', async () => {
  const entity = definitionEntity();
  entity.metadata.annotations = {
    'backstage.io/edit-url': 'https://example.com/catalog-info.yaml',
    'backstage.io/source-location': 'url:https://example.com/repository',
  };
  renderDetails(entity);
  await userEvent.click(await screen.findByRole('button', { name: 'Actions' }));
  expect(
    await screen.findByRole('menuitem', { name: 'Edit definition' }),
  ).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: 'View in source' })).toBeTruthy();
  expect(screen.queryByRole('menuitem', { name: 'Build' })).toBeNull();
});
