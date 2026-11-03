import {
  ContentApiError,
  type AutomationContentApi,
  type ExecutionEnvironmentPage,
  type ArtifactContents,
  type ContentItemSummary,
} from '../api';
import { createDemoImages, hasDemoInventory } from './fixtures';
import { isDemoImageRef } from './metadata';

/** API responses are plain data; independent copies prevent cross-fixture/cache mutation. */
function copy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => copy(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, copy(item)]),
    ) as T;
  }
  return value;
}

/** Read-only development overlay: live failures stay failures and writes never reach the backend. */
export function createDemoApi(
  live: AutomationContentApi,
  sourceRef?: string,
): AutomationContentApi & {
  readonly developmentDemoImages: true;
} {
  const fixtures = createDemoImages();
  let sourceImage:
    | ReturnType<AutomationContentApi['getExecutionEnvironment']>
    | undefined;
  const contentsCache = new Map<string, Promise<ArtifactContents>>();
  const getSourceImage = () => {
    if (isDemoImageRef(sourceRef!)) {
      return Promise.reject(
        new ContentApiError(404, 'Inventory source must be a live image.'),
      );
    }
    sourceImage ??= live.getExecutionEnvironment(sourceRef!).then(copy);
    return sourceImage;
  };
  const backed = (ref: string) => Boolean(sourceRef) && hasDemoInventory(ref);
  const rewriteItem = <T extends ContentItemSummary>(
    item: T,
    ref: string,
  ): T => {
    const result = copy(item);
    if (result.in === sourceRef) result.in = ref;
    if ('providedBy' in result && Array.isArray(result.providedBy)) {
      result.providedBy = result.providedBy.map(provider =>
        provider === sourceRef ? ref : provider,
      );
    }
    return result;
  };
  const hydrate = async (image: (typeof fixtures)[number]) => {
    if (!backed(image.ref)) return copy(image);
    const source = await getSourceImage();
    return {
      ...copy(image),
      contentsKnown: source.contentsKnown,
      enumeration: copy(source.enumeration),
      counts: copy(source.counts),
      collections: copy(source.collections),
    };
  };
  const lookup = (ref: string) => {
    const image = fixtures.find(item => item.ref === ref);
    if (!image)
      throw new ContentApiError(404, 'Unknown synthetic development image.');
    return image;
  };
  const rejectWrite = async (): Promise<never> => {
    throw new Error(
      'Registry sync is disabled while development demo images are enabled.',
    );
  };
  return {
    developmentDemoImages: true,
    listRegistries: () => live.listRegistries(),
    listCollections: query => live.listCollections(query),
    async listExecutionEnvironments(
      opts = {},
    ): Promise<ExecutionEnvironmentPage> {
      const perPage = [10, 20, 50].includes(opts.perPage ?? 10)
        ? (opts.perPage ?? 10)
        : 10;
      // Match the backend: normalize lower bounds, but retain out-of-range pages as empty.
      const page = Math.max(1, Math.floor(Number(opts.page) || 1));
      const offset = (page - 1) * perPage;
      const liveOffset = Math.max(0, offset - fixtures.length);
      const livePage = Math.floor(liveOffset / perPage) + 1;
      // Always read live totals, even for a page filled entirely by fixtures. Never hide an outage.
      const first = await live.listExecutionEnvironments({
        ...opts,
        page: livePage,
        perPage,
      });
      const totalItems = fixtures.length + first.totalItems;
      const demoItems = fixtures.slice(offset, offset + perPage);
      const needed = Math.max(
        0,
        Math.min(perPage - demoItems.length, first.totalItems - liveOffset),
      );
      const withinPage = liveOffset % perPage;
      const liveItems = first.items.slice(withinPage, withinPage + needed);
      if (needed > liveItems.length) {
        const second = await live.listExecutionEnvironments({
          ...opts,
          page: livePage + 1,
          perPage,
        });
        liveItems.push(...second.items.slice(0, needed - liveItems.length));
      }
      const query = new URLSearchParams({
        page: String(page + 1),
        per_page: String(perPage),
      });
      if (!opts.allTypes) query.set('type', 'execution-environment');
      return {
        items: [...(await Promise.all(demoItems.map(hydrate))), ...liveItems],
        page,
        totalItems,
        next: page * perPage < totalItems ? `?${query}` : null,
      };
    },
    async getExecutionEnvironment(ref) {
      return isDemoImageRef(ref)
        ? hydrate(lookup(ref))
        : live.getExecutionEnvironment(ref);
    },
    async getContents(ref, opts) {
      if (!isDemoImageRef(ref)) return live.getContents(ref, opts);
      const image = lookup(ref);
      if (backed(ref)) {
        // Validate/load the same source image used by list/detail metadata.
        await getSourceImage();
        const key = `${opts?.depth ?? 'direct'}:${opts?.type ?? ''}`;
        let contents = contentsCache.get(key);
        if (!contents) {
          contents = live.getContents(sourceRef!, opts).then(copy);
          contentsCache.set(key, contents);
        }
        const result = copy(await contents);
        result.items = result.items.map(item => rewriteItem(item, ref));
        return result;
      }
      return {
        enumeration: copy(image.enumeration),
        collections: [],
        items: [],
      };
    },
    async searchContentItems(params) {
      if (!params.in || !isDemoImageRef(params.in))
        return live.searchContentItems(params);
      lookup(params.in);
      if (backed(params.in)) {
        await getSourceImage();
        const result = await live.searchContentItems({
          ...params,
          in: sourceRef,
        });
        return {
          ...result,
          items: result.items.map(item => rewriteItem(item, params.in!)),
        };
      }
      return { items: [], totalItems: 0 };
    },
    async getContentItem(fqcn, inArtifact) {
      if (!inArtifact || !isDemoImageRef(inArtifact))
        return live.getContentItem(fqcn, inArtifact);
      lookup(inArtifact);
      if (backed(inArtifact)) {
        await getSourceImage();
        const result = rewriteItem(
          await live.getContentItem(fqcn, sourceRef),
          inArtifact,
        );
        return result;
      }
      throw new ContentApiError(
        404,
        'Synthetic development images have no documentation.',
      );
    },
    syncAll: rejectWrite,
    syncRegistry: rejectWrite,
  };
}
