import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TestApiProvider } from '@backstage/test-utils';
import userEvent from '@testing-library/user-event';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { automationContentApiRef, type ExecutionEnvironment } from '../../api';
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

it.each(['registry/repo@sha256:one', 'registry/repo@sha256:two'])(
  'keeps collections scoped to %s',
  async ref => {
    const getEntities = jest.fn().mockResolvedValue({ items: [] });
    const getContents = jest.fn().mockResolvedValue({
      enumeration: image.enumeration,
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
              getExecutionEnvironment: async () => ({ ...image, ref }),
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
    expect(getEntities).toHaveBeenCalledWith({
      filter: {
        kind: 'Component',
        'metadata.annotations.ansible.com/digest': [image.digest],
      },
    });
    expect(screen.getByText('Approximate: 2')).toBeTruthy();
  },
);

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
  expect(screen.getByText('labels')).toBeTruthy();
  expect(screen.queryByText('Provenance')).toBeNull();
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  expect(
    screen.getByRole('menuitem', { name: 'Use in controller' }),
  ).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: 'Sync' })).toBeTruthy();
  expect(
    screen.getByRole('menuitem', { name: 'Copy pull reference' }),
  ).toBeTruthy();
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
    screen.getByRole('menuitem', { name: 'Use in controller' }),
  );
  expect(await screen.findByRole('dialog')).toBeTruthy();
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in controller' }),
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
