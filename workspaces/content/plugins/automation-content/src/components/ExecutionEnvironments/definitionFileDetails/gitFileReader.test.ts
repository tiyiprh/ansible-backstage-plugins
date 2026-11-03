import type { Entity } from '@backstage/catalog-model';
import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import {
  fetchGitFileContentFromBackend,
  getGitFileLocation,
  sourceFilePath,
} from './gitFileReader';

const sourceEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'networking-ee',
    annotations: {
      'backstage.io/source-location':
        'url:https://github.com/ansible/networking-ee/tree/release/docs',
      'ansible.io/scm-provider': 'github',
    },
  },
};

it('resolves readme and definition paths from catalog source annotations', () => {
  const location = getGitFileLocation(sourceEntity);
  expect(location).toEqual({
    scmProvider: 'github',
    host: 'github.com',
    owner: 'ansible',
    repo: 'networking-ee',
    ref: 'release',
    subdir: 'docs',
  });
  expect(sourceFilePath(location!, sourceEntity.metadata.name, 'readme')).toBe(
    'docs/README.md',
  );
  expect(
    sourceFilePath(location!, sourceEntity.metadata.name, 'definition'),
  ).toBe('docs/networking-ee.yml');
});

it('rejects unsupported providers, malformed URLs, and embedded credentials', () => {
  const withAnnotations = (source: string, provider: string): Entity => ({
    ...sourceEntity,
    metadata: {
      ...sourceEntity.metadata,
      annotations: {
        'backstage.io/source-location': source,
        'ansible.io/scm-provider': provider,
      },
    },
  });

  expect(
    getGitFileLocation(
      withAnnotations('https://user:secret@github.com/org/repo', 'github'),
    ),
  ).toBeUndefined();
  expect(
    getGitFileLocation(withAnnotations('not a URL', 'github')),
  ).toBeUndefined();
  expect(
    getGitFileLocation(
      withAnnotations('https://example.com/org/repo', 'bitbucket'),
    ),
  ).toBeUndefined();
});

it('uses the catalog backend file endpoint and distinguishes integration auth failures', async () => {
  const location = getGitFileLocation(sourceEntity)!;
  const getBaseUrl = jest.fn(async () => '/api/catalog');
  const fetch = jest.fn(async () => ({
    ok: false,
    json: async () => ({ code: 'INTEGRATION_AUTH_FAILED' }),
  }));

  const outcome = await fetchGitFileContentFromBackend(
    { getBaseUrl } as unknown as DiscoveryApi,
    { fetch } as unknown as FetchApi,
    location,
    'docs/README.md',
  );

  expect(outcome).toEqual({ ok: false, reason: 'integration_auth' });
  expect(getBaseUrl).toHaveBeenCalledWith('catalog');
  expect(String(fetch.mock.calls[0][0])).toContain(
    '/ansible/git/file-content?',
  );
  expect(String(fetch.mock.calls[0][0])).toContain('filePath=docs%2FREADME.md');
});
