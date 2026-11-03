import type { Entity } from '@backstage/catalog-model';
import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { isHttpUrl } from '@ansible/automation-content-common/url';

export interface GitFileLocation {
  scmProvider: 'github' | 'gitlab';
  host: string;
  owner: string;
  repo: string;
  ref: string;
  subdir: string;
}

export type GitFileOutcome =
  | { ok: true; data: string }
  | { ok: false; reason: 'integration_auth' | 'other' };

/** Resolve the same source coordinates used by the catalog git-file endpoint. */
export function getGitFileLocation(
  entity: Entity,
): GitFileLocation | undefined {
  const rawSource =
    entity.metadata.annotations?.['backstage.io/source-location'];
  const rawProvider = entity.metadata.annotations?.['ansible.io/scm-provider'];
  if (!rawSource || !rawProvider) return undefined;

  const sourceUrl = rawSource.replace(/^url:/i, '').replace(/\/$/, '').trim();
  if (!isHttpUrl(sourceUrl)) return undefined;

  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return undefined;
  }
  if (url.username || url.password) return undefined;

  const providerName = rawProvider.toLowerCase();
  if (!providerName.includes('github') && !providerName.includes('gitlab')) {
    return undefined;
  }
  const scmProvider = providerName.includes('github') ? 'github' : 'gitlab';
  const path = url.pathname.split('/').filter(Boolean);
  if (path.length < 2) return undefined;

  const owner = path[0];
  const repo = path[1];
  const markerIndex = path.indexOf('tree');
  const ref =
    markerIndex >= 0 && path[markerIndex + 1] ? path[markerIndex + 1] : 'main';
  let subdir = '';
  if (markerIndex >= 0) {
    subdir = path.slice(markerIndex + 2).join('/');
  } else if (scmProvider === 'github') {
    subdir = path.slice(2).join('/');
  } else if (path.length > 2) {
    subdir = path.at(-1) ?? '';
  }

  return { scmProvider, host: url.host, owner, repo, ref, subdir };
}

export function sourceFilePath(
  location: GitFileLocation,
  entityName: string,
  kind: 'readme' | 'definition',
): string {
  const filename = kind === 'readme' ? 'README.md' : `${entityName}.yml`;
  return location.subdir ? `${location.subdir}/${filename}` : filename;
}

/** Read through the catalog backend's authenticated SCM integration endpoint. */
export async function fetchGitFileContentFromBackend(
  discoveryApi: DiscoveryApi,
  fetchApi: FetchApi,
  location: GitFileLocation,
  filePath: string,
): Promise<GitFileOutcome> {
  try {
    const baseUrl = await discoveryApi.getBaseUrl('catalog');
    const query = new URLSearchParams({
      scmProvider: location.scmProvider,
      host: location.host,
      owner: location.owner,
      repo: location.repo,
      filePath,
      ref: location.ref,
    });
    const response = await fetchApi.fetch(
      `${baseUrl}/ansible/git/file-content?${query.toString()}`,
    );
    if (response.ok) return { ok: true, data: await response.text() };

    try {
      const body = (await response.json()) as { code?: unknown };
      if (body.code === 'INTEGRATION_AUTH_FAILED') {
        return { ok: false, reason: 'integration_auth' };
      }
    } catch {
      // Keep non-JSON backend errors as the generic unavailable outcome.
    }
    return { ok: false, reason: 'other' };
  } catch {
    return { ok: false, reason: 'other' };
  }
}
