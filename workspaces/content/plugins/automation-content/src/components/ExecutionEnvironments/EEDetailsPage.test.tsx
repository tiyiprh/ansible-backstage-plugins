import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TestApiProvider } from '@backstage/test-utils';
import userEvent from '@testing-library/user-event';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import {
  automationContentApiRef,
  type ArtifactContents,
  type Enumeration,
  type ExecutionEnvironment,
} from '../../api';
import { EEDetailsPage } from './EEDetailsPage';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/content',
}));
let entityStarred = false;
const toggleStarredEntity = jest.fn((_entity: unknown) => {
  entityStarred = !entityStarred;
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
jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useStarredEntities: () => ({
    isStarredEntity: () => entityStarred,
    toggleStarredEntity: (entity: unknown) => toggleStarredEntity(entity),
  }),
}));

const image: ExecutionEnvironment = {
  ref: 'registry/repo@sha256:one',
  registry: 'registry',
  repository: 'repo',
  digest: 'sha256:one',
  tags: [],
  pullReference: 'registry/repo@sha256:one',
  contentsKnown: true,
  enumeration: { status: 'partial', source: 'labels' },
  collections: [],
};

it.each([
  ['registry/repo@sha256:one', image.enumeration, 'Approximate: 2 plugins'],
  ['registry/repo@sha256:two', image.enumeration, 'Approximate: 2 plugins'],
  [
    'registry/repo@sha256:complete',
    { status: 'complete', source: 'build-time-manifest' } satisfies Enumeration,
    '2 plugins',
  ],
] as const)(
  'keeps collections scoped to %s',
  async (ref, enumeration, expectedContents) => {
    const getEntities = jest.fn().mockResolvedValue({ items: [] });
    const getContents = jest.fn().mockResolvedValue({
      enumeration,
      collections: [
        {
          namespace: 'ansible',
          name: 'posix',
          fqcn: 'ansible.posix',
          version: '1.0.0',
          counts: { plugins: 2 },
        },
      ],
      items: [],
    });
    render(
      <TestApiProvider
        apis={[
          [catalogApiRef, { getEntities }],
          [
            automationContentApiRef,
            {
              getExecutionEnvironment: async () => ({
                ...image,
                ref,
                enumeration,
              }),
              getContents,
            },
          ],
        ]}
      >
        <MemoryRouter
          initialEntries={[`/${encodeURIComponent(ref)}?tab=collections`]}
        >
          <Routes>
            <Route path=":ref" element={<EEDetailsPage />} />
          </Routes>
        </MemoryRouter>
      </TestApiProvider>,
    );
    const link = await screen.findByRole('link', { name: 'ansible.posix' });
    expect(link.getAttribute('href')).toContain(
      new URLSearchParams({ in: ref, version: '1.0.0' }).toString(),
    );
    expect(getContents).toHaveBeenCalledWith(ref);
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Overview',
      'Collections',
    ]);
    expect(screen.queryByRole('tab', { name: 'Content items' })).toBeNull();
    expect(getEntities).toHaveBeenCalledWith({
      filter: {
        kind: 'Component',
        'metadata.annotations.ansible.com/digest': [image.digest],
      },
    });
    expect(screen.getByText(expectedContents)).toBeTruthy();
    expect(screen.queryByText(/inventory ·/)).toBeNull();
    expect(
      screen
        .getAllByRole('columnheader')
        .map(header => header.textContent?.trim()),
    ).toEqual([
      'Collection',
      'Version',
      'Status',
      'Publisher',
      'Signing',
      'Source',
      'Contents',
    ]);
    for (const countColumn of [
      'Plugins',
      'Roles',
      'Playbooks',
      'EDA plugins',
      'Rulebooks',
    ]) {
      expect(
        screen.queryByRole('columnheader', { name: countColumn }),
      ).toBeNull();
    }
    expect(screen.getAllByText('Not reported')).toHaveLength(4);
    expect(screen.queryByText('Certified')).toBeNull();
    expect(screen.queryByText('Signed')).toBeNull();
  },
);

function renderLegacyContentLink(query: string) {
  const getContentItem = jest.fn().mockResolvedValue({
    fqcn: 'ansible.posix.mount',
    type: 'module',
    collection: 'ansible.posix',
    collectionVersion: '1.0.0',
    description: ['Retained direct documentation'],
    enumeration: image.enumeration,
    providedBy: [image.ref],
  });
  render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => image,
            getContents: async () => ({
              enumeration: image.enumeration,
              collections: [],
              items: [],
            }),
            getContentItem,
          },
        ],
      ]}
    >
      <MemoryRouter
        initialEntries={[`/${encodeURIComponent(image.ref)}${query}`]}
      >
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  return getContentItem;
}

it('falls back to Overview for the removed content tab', async () => {
  const getContentItem = renderLegacyContentLink('?tab=content');
  expect(
    await screen.findByRole('tab', { name: 'Overview', selected: true }),
  ).toBeTruthy();
  expect(screen.getAllByRole('tab')).toHaveLength(2);
  expect(screen.queryByRole('tab', { name: 'Content items' })).toBeNull();
  expect(getContentItem).not.toHaveBeenCalled();
});

it('retains direct documentation links with a Collections back link', async () => {
  const getContentItem = renderLegacyContentLink(
    '?tab=content&item=ansible.posix.mount',
  );
  await screen.findByText('Retained direct documentation');
  expect(getContentItem).toHaveBeenCalledWith('ansible.posix.mount', image.ref);
  expect(
    screen.getByRole('link', { name: 'repo' }).getAttribute('href'),
  ).toContain('?tab=collections');
});

it('shows populated image metadata without leaking missing classification confidence', async () => {
  const pullReference = `registry.example.net/ansible/utopia-ee@sha256:${'a'.repeat(
    64,
  )}`;
  const populatedImage: ExecutionEnvironment = {
    ...image,
    ref: pullReference,
    registry: 'Production registry',
    repository: 'ansible/utopia-ee',
    digest: `sha256:${'a'.repeat(64)}`,
    pullReference,
    type: 'execution-environment',
    classification: {
      type: 'execution-environment',
      confidence: undefined as unknown as string,
      signals: [],
    },
    tags: ['latest', '3.0.1'],
    contentsKnown: true,
    enumeration: {
      status: 'complete',
      source: 'build-time-manifest',
      ansibleCore: '2.16.4',
      extractedAt: '2025-01-05T12:00:00Z',
    },
    counts: { collections: 6, plugins: 457 },
  };
  const { container } = render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => populatedImage,
            getContents: async () => ({
              enumeration: populatedImage.enumeration,
              collections: [],
              items: [],
            }),
          },
        ],
      ]}
    >
      <MemoryRouter initialEntries={[`/${encodeURIComponent(pullReference)}`]}>
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );

  expect(
    await screen.findByRole('heading', { name: 'ansible/utopia-ee' }),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Images' })).toBeTruthy();
  expect(screen.getByText('Production registry')).toBeTruthy();
  expect(screen.getByText('Build-time manifest')).toBeTruthy();
  expect(screen.getByText('6 collections / 457 plugins')).toBeTruthy();
  expect(screen.getByText('Unknown')).toBeTruthy();
  expect(screen.getByText(pullReference)).toBeTruthy();
  expect(container.querySelectorAll('.bui-Card')).toHaveLength(1);
  expect(screen.queryByText(/undefined/)).toBeNull();
  expect(screen.queryByText(/confidence/i)).toBeNull();
});

it('combines only reported collection content counts and marks missing metadata', async () => {
  const enumeration: Enumeration = {
    status: 'complete',
    source: 'build-time-manifest',
  };
  const completeImage: ExecutionEnvironment = {
    ...image,
    contentsKnown: true,
    enumeration,
  };
  const completeContents: ArtifactContents = {
    enumeration,
    collections: [
      {
        namespace: 'ansible',
        name: 'posix',
        fqcn: 'ansible.posix',
        version: '2.0.0',
        counts: { plugins: 48, roles: 5, playbooks: 3 },
      },
    ],
    items: [],
  };
  const getContents = jest.fn(async () => completeContents);
  render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => completeImage,
            getContents,
          },
        ],
      ]}
    >
      <MemoryRouter
        initialEntries={[`/${encodeURIComponent(image.ref)}?tab=collections`]}
      >
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );

  expect(
    await screen.findByRole('link', { name: 'ansible.posix' }),
  ).toBeTruthy();
  expect(screen.getByText('48 plugins, 5 roles, 3 playbooks')).toBeTruthy();
  expect(screen.getAllByText('Not reported')).toHaveLength(4);
  expect(screen.queryByText(/0 (plugins|roles|playbooks)/)).toBeNull();
  expect(getContents).toHaveBeenCalledWith(image.ref);
});

it('keeps collection contents unknown when the image inventory is unknown', async () => {
  const enumeration: Enumeration = {
    status: 'unknown',
    source: 'external-introspection',
  };
  const unknownImage: ExecutionEnvironment = {
    ...image,
    contentsKnown: false,
    enumeration,
  };
  const unknownContents: ArtifactContents = {
    enumeration,
    collections: [
      {
        namespace: 'ansible',
        name: 'posix',
        fqcn: 'ansible.posix',
        version: '1.0.0',
        counts: { plugins: 10 },
      },
    ],
    items: [],
  };
  render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => unknownImage,
            getContents: async () => unknownContents,
          },
        ],
      ]}
    >
      <MemoryRouter
        initialEntries={[`/${encodeURIComponent(image.ref)}?tab=collections`]}
      >
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );

  expect(
    await screen.findByRole('link', { name: 'ansible.posix' }),
  ).toBeTruthy();
  expect(screen.getByText('Unknown')).toBeTruthy();
  expect(screen.queryByText('10 plugins')).toBeNull();
});

it('shows artifact overview, themed source and status, and controller actions', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  const entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'image',
      annotations: {
        'ansible.com/registry': image.registry,
        'ansible.com/repository': image.repository,
        'ansible.com/digest': image.digest,
      },
    },
  };
  const getEntities = jest.fn().mockResolvedValue({ items: [entity] });
  const scaffold = jest.fn().mockRejectedValue(new Error('template not found'));
  const { rerender } = render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities }],
        [scaffolderApiRef, { scaffold }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => ({
              ...image,
              type: 'execution-environment',
              classification: {
                type: 'execution-environment',
                confidence: 'likely',
                signals: [],
              },
              contentsKnown: false,
              counts: { collections: 0, plugins: 0 },
              tags: ['latest', '1.0'],
            }),
            getContents: async () => ({
              enumeration: image.enumeration,
              collections: [],
              items: [],
            }),
          },
        ],
      ]}
    >
      <MemoryRouter initialEntries={[`/${encodeURIComponent(image.ref)}`]}>
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(
    await screen.findByRole('tab', { name: 'Overview', selected: true }),
  ).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Collections' })).toBeTruthy();
  expect(screen.getByText('Contents unknown')).toBeTruthy();
  expect(screen.queryByText('0 collections / 0 plugins')).toBeNull();
  expect(screen.getByText('latest')).toBeTruthy();
  expect(screen.getByText('1.0')).toBeTruthy();
  expect(screen.getByText('External registry')).toBeTruthy();
  expect(screen.getByText('Syncing')).toBeTruthy();
  expect(screen.getByText('Registry labels')).toBeTruthy();
  expect(screen.getByText('Execution environment')).toBeTruthy();
  expect(screen.queryByText(/likely/)).toBeNull();
  expect(screen.queryByText('Provenance')).toBeNull();
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
  expect(screen.getByRole('menuitem', { name: 'Favorite' })).toBeTruthy();
  await userEvent.click(screen.getByRole('menuitem', { name: 'Favorite' }));
  expect(toggleStarredEntity).toHaveBeenCalledWith(entity);
  rerender(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities }],
        [scaffolderApiRef, { scaffold }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => ({
              ...image,
              contentsKnown: false,
              counts: { collections: 0, plugins: 0 },
              tags: ['latest', '1.0'],
            }),
            getContents: async () => ({
              enumeration: image.enumeration,
              collections: [],
              items: [],
            }),
          },
        ],
      ]}
    >
      <MemoryRouter initialEntries={[`/${encodeURIComponent(image.ref)}`]}>
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  expect(screen.getByRole('menuitem', { name: 'Unfavorite' })).toBeTruthy();
  await userEvent.keyboard('{Escape}');
  expect(getEntities).toHaveBeenCalledWith({
    filter: {
      kind: 'Component',
      'metadata.annotations.ansible.com/digest': [image.digest],
    },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  await userEvent.click(
    screen.getByRole('menuitem', { name: 'Use in Controller' }),
  );
  expect(await screen.findByRole('dialog')).toBeTruthy();
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in Controller' }),
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    'This action is not available yet. The task template was not found.',
  );
  expect(scaffold).toHaveBeenCalledWith({
    templateRef: 'template:default/ee-use-in-controller',
    values: {
      environmentName: 'repo',
      environmentDescription: 'Use repo in Ansible Automation Controller.',
      image: image.pullReference,
      pull: 'always',
      organization: '',
    },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Copy pull reference' }),
  );
  expect(writeText).toHaveBeenCalledWith(image.pullReference);
  expect(await screen.findByText('Pull reference copied')).toBeTruthy();
  expect(
    screen.queryByRole('tab', { name: 'Collections in this image' }),
  ).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Definition file' })).toBeNull();
});
