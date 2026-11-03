import {
  ContentApiError,
  type AutomationContentApi,
  type ExecutionEnvironment,
  type ArtifactContents,
  type ContentItem,
} from '../api';
import { createDemoApi } from './demoApi';
import { createDemoImages, demoImageRef } from './fixtures';

function setup(count = 73) {
  const rows: ExecutionEnvironment[] = Array.from(
    { length: count },
    (_, i) => ({
      ...createDemoImages()[0],
      ref: `live/${i}`,
      repository: `live-${i}`,
    }),
  );
  const live = {
    listExecutionEnvironments: jest.fn(
      async ({ page = 1, perPage = 10 } = {}) => ({
        items: rows.slice((page - 1) * perPage, page * perPage),
        page,
        totalItems: rows.length,
        next: null,
      }),
    ),
    listRegistries: jest.fn().mockResolvedValue([]),
    listCollections: jest.fn().mockResolvedValue([]),
    getExecutionEnvironment: jest.fn().mockResolvedValue(rows[0]),
    getContents: jest.fn().mockResolvedValue({ items: [] }),
    searchContentItems: jest
      .fn()
      .mockResolvedValue({ items: [], totalItems: 0 }),
    getContentItem: jest.fn().mockRejectedValue(new Error('live docs')),
    syncAll: jest.fn(),
    syncRegistry: jest.fn(),
  };
  return { live, rows, api: createDemoApi(live as AutomationContentApi) };
}

function inventorySetup() {
  const { live, rows } = setup();
  const sourceRef = 'live/source@sha256:immutable';
  const collection = {
    namespace: 'ns',
    name: 'tools',
    version: '1.0.0',
    fqcn: 'ns.tools',
  };
  const enumeration = {
    status: 'complete',
    source: 'build-time-manifest',
  } as const;
  const source: ExecutionEnvironment = {
    ...rows[0],
    ref: sourceRef,
    definitionEntityRef: 'component:default/source-only',
    contentsKnown: true,
    enumeration,
    counts: { collections: 1, plugins: 1 },
    collections: [collection],
  };
  const doc: ContentItem = {
    in: sourceRef,
    fqcn: 'ns.tools.run',
    name: 'run',
    type: 'module',
    collection: 'ns.tools',
    collectionVersion: '1.0.0',
    enumeration,
    providedBy: [sourceRef, 'other/provider'],
    description: ['Actual source documentation'],
    options: { path: { type: 'str', description: ['Real argument'] } },
  };
  const contents: ArtifactContents = {
    enumeration,
    collections: [{ ...collection, counts: { plugins: 1 } }],
    items: [doc],
  };
  live.getExecutionEnvironment.mockResolvedValue(source);
  live.getContents.mockResolvedValue(contents);
  live.searchContentItems.mockResolvedValue({ items: [doc], totalItems: 1 });
  live.getContentItem.mockResolvedValue(doc);
  return {
    live,
    source,
    sourceRef,
    contents,
    doc,
    api: createDemoApi(live, sourceRef),
  };
}

it('reuses actual inventory for backed variants, preserving each identity and unknown cases', async () => {
  const { api, source, sourceRef, live } = inventorySetup();
  const page = await api.listExecutionEnvironments({ perPage: 20 });
  expect(page.totalItems).toBe(80);
  expect(page.items.slice(0, 7).map(row => row.ref)).toEqual(
    createDemoImages().map(row => row.ref),
  );
  for (const index of [0, 2, 3, 4, 5]) {
    const image = await api.getExecutionEnvironment(demoImageRef(index));
    expect(image.counts).toEqual(source.counts);
    expect(image.collections).toEqual(source.collections);
    expect(image.enumeration).toEqual(source.enumeration);
    expect(image.repository).toBe(createDemoImages()[index].repository);
    expect(image.definitionEntityRef).toBe(
      createDemoImages()[index].definitionEntityRef,
    );
    expect(page.items[index].counts).toEqual(source.counts);
    expect((await api.getContents(image.ref)).items).toHaveLength(1);
  }
  for (const index of [1, 6]) {
    const image = await api.getExecutionEnvironment(demoImageRef(index));
    expect(image.contentsKnown).toBe(false);
    expect(image.counts).toBeUndefined();
    expect(image.collections).toEqual([]);
    expect((await api.getContents(image.ref)).items).toEqual([]);
    expect(await api.searchContentItems({ in: image.ref })).toEqual({
      items: [],
      totalItems: 0,
    });
    await expect(
      api.getContentItem('ns.tools.run', image.ref),
    ).rejects.toMatchObject({ status: 404 });
  }
  expect(live.getExecutionEnvironment).toHaveBeenCalledTimes(1);
  expect(live.getExecutionEnvironment).toHaveBeenCalledWith(sourceRef);
  expect(live.getContents).toHaveBeenCalledTimes(1);
  expect(live.getContents).toHaveBeenCalledWith(sourceRef, undefined);
  expect(live.searchContentItems).not.toHaveBeenCalled();
  expect(live.getContentItem).not.toHaveBeenCalled();
});

it('preserves scoped filters/totals and rewrites artifact providers without changing collection identity', async () => {
  const { api, live, sourceRef, doc, contents } = inventorySetup();
  const ref = demoImageRef(3);
  const params = {
    in: ref,
    q: 'run',
    type: 'module',
    collection: 'ns.tools',
    limit: 50,
  };
  const search = await api.searchContentItems(params);
  expect(live.searchContentItems).toHaveBeenCalledWith({
    ...params,
    in: sourceRef,
  });
  expect(search.totalItems).toBe(1);
  expect(search.items[0].in).toBe(ref);
  expect(search.items[0].collection).toBe('ns.tools');
  const result = await api.getContentItem(doc.fqcn, ref);
  expect(live.getContentItem).toHaveBeenCalledWith(doc.fqcn, sourceRef);
  expect(result.in).toBe(ref);
  expect(result.providedBy).toEqual([ref, 'other/provider']);
  expect(result.options).toEqual(doc.options);
  const resultContents = await api.getContents(ref, {
    depth: 'flat',
    type: 'module',
  });
  expect(live.getContents).toHaveBeenCalledWith(sourceRef, {
    depth: 'flat',
    type: 'module',
  });
  expect(resultContents.items[0].in).toBe(ref);
  expect(resultContents.items[0]).toMatchObject({
    providedBy: [ref, 'other/provider'],
  });
  expect(resultContents.collections).toEqual(contents.collections);
  expect(doc.in).toBe(sourceRef);
  expect(doc.providedBy[0]).toBe(sourceRef);
});

it('copies cached data independently across fixtures and callers', async () => {
  const { api, source, contents } = inventorySetup();
  const first = await api.getExecutionEnvironment(demoImageRef(0));
  first.counts!.plugins = 999;
  first.collections[0].name = 'mutated';
  const firstContents = await api.getContents(first.ref);
  firstContents.items[0].name = 'mutated';
  firstContents.collections[0].counts.plugins = 999;
  const second = await api.getExecutionEnvironment(demoImageRef(2));
  expect(second.counts).toEqual({ collections: 1, plugins: 1 });
  expect(second.collections[0].name).toBe('tools');
  const secondContents = await api.getContents(second.ref);
  expect(secondContents.items[0].name).toBe('run');
  expect(secondContents.collections[0].counts.plugins).toBe(1);
  expect(source.counts!.plugins).toBe(1);
  expect(contents.items[0].name).toBe('run');
});

it('preserves combined page boundaries with inventory reuse enabled', async () => {
  const { api, live } = inventorySetup();
  for (const perPage of [10, 20, 50]) {
    const first = await api.listExecutionEnvironments({
      page: 1,
      perPage,
      allTypes: true,
    });
    live.listExecutionEnvironments.mockClear();
    const second = await api.listExecutionEnvironments({
      page: 2,
      perPage,
      allTypes: true,
    });
    expect(second.totalItems).toBe(80);
    expect(second.next !== null).toBe(2 * perPage < 80);
    const refs = [...first.items, ...second.items].map(image => image.ref);
    expect(new Set(refs).size).toBe(refs.length);
    expect(second.items[0].ref).toBe(`live/${perPage - 7}`);
    expect(
      live.listExecutionEnvironments.mock.calls.length,
    ).toBeLessThanOrEqual(2);
  }
  expect(live.getExecutionEnvironment).toHaveBeenCalledTimes(1);
});

it('propagates cached source and contents failures without inventing inventory', async () => {
  const { api, live } = inventorySetup();
  live.getExecutionEnvironment.mockRejectedValue(new Error('source offline'));
  await expect(api.listExecutionEnvironments()).rejects.toThrow(
    'source offline',
  );
  await expect(api.getExecutionEnvironment(demoImageRef(0))).rejects.toThrow(
    'source offline',
  );
  expect(live.getExecutionEnvironment).toHaveBeenCalledTimes(1);
  const second = inventorySetup();
  second.live.getContents.mockRejectedValue(new Error('contents offline'));
  await expect(second.api.getContents(demoImageRef(0))).rejects.toThrow(
    'contents offline',
  );
  await expect(second.api.getContents(demoImageRef(3))).rejects.toThrow(
    'contents offline',
  );
  expect(second.live.getContents).toHaveBeenCalledTimes(1);
});

it('keeps reserved unknown refs and writes local even with a configured source', async () => {
  const { api, live } = inventorySetup();
  const ref = 'demo.invalid/utopia/missing';
  await expect(api.getExecutionEnvironment(ref)).rejects.toMatchObject({
    status: 404,
  });
  await expect(api.getContents(ref)).rejects.toMatchObject({ status: 404 });
  await expect(api.searchContentItems({ in: ref })).rejects.toMatchObject({
    status: 404,
  });
  await expect(api.getContentItem('ns.tools.run', ref)).rejects.toMatchObject({
    status: 404,
  });
  await expect(api.syncAll()).rejects.toThrow('disabled');
  await expect(api.syncRegistry('real')).rejects.toThrow('disabled');
  expect(live.getExecutionEnvironment).not.toHaveBeenCalled();
  expect(live.getContents).not.toHaveBeenCalled();
  expect(live.searchContentItems).not.toHaveBeenCalled();
  expect(live.getContentItem).not.toHaveBeenCalled();
  expect(live.syncAll).not.toHaveBeenCalled();
  expect(live.syncRegistry).not.toHaveBeenCalled();
});

it.each([0, 1, 8, 13, 73, 151])(
  'paginates fixtures exactly once alongside %s live rows',
  async count => {
    for (const perPage of [10, 20, 50]) {
      const { live, rows, api } = setup(count);
      const refs: string[] = [];
      const pages = Math.ceil((count + 7) / perPage);
      for (let page = 1; page <= pages + 1; page++) {
        live.listExecutionEnvironments.mockClear();
        const result = await api.listExecutionEnvironments({
          page,
          perPage,
          allTypes: true,
        });
        expect(result.totalItems).toBe(count + 7);
        expect(result.page).toBe(page);
        expect(result.next !== null).toBe(page < pages);
        expect(
          live.listExecutionEnvironments.mock.calls.length,
        ).toBeLessThanOrEqual(2);
        expect(live.listExecutionEnvironments).toHaveBeenCalledWith(
          expect.objectContaining({ allTypes: true, perPage }),
        );
        refs.push(...result.items.map(row => row.ref));
      }
      expect(refs).toEqual(
        [...createDemoImages(), ...rows].map(row => row.ref),
      );
      expect(new Set(refs).size).toBe(refs.length);
    }
  },
);

it('normalizes invalid size and page without requesting page zero', async () => {
  const { api, live } = setup();
  const result = await api.listExecutionEnvironments({ page: 0, perPage: 25 });
  expect(result.page).toBe(1);
  expect(result.items).toHaveLength(10);
  expect(result.next).toContain('per_page=10');
  expect(live.listExecutionEnvironments).toHaveBeenCalledWith({
    page: 1,
    perPage: 10,
  });
});

it('keeps live failures visible', async () => {
  const { api, live } = setup();
  live.listExecutionEnvironments.mockRejectedValueOnce(new Error('offline'));
  await expect(api.listExecutionEnvironments()).rejects.toThrow('offline');
});

it('delegates real reads unchanged', async () => {
  const { api, live } = setup();
  await api.listRegistries();
  await api.listCollections('query');
  await api.getExecutionEnvironment('real');
  await api.getContents('real', { depth: 'flat' });
  await api.searchContentItems({ in: 'real', q: 'mount' });
  await api.searchContentItems({ q: 'unscoped' });
  await expect(api.getContentItem('module', 'real')).rejects.toThrow(
    'live docs',
  );
  expect(live.listRegistries).toHaveBeenCalledTimes(1);
  expect(live.listCollections).toHaveBeenCalledWith('query');
  expect(live.getExecutionEnvironment).toHaveBeenCalledWith('real');
  expect(live.getContents).toHaveBeenCalledWith('real', { depth: 'flat' });
  expect(live.searchContentItems).toHaveBeenCalledWith({
    in: 'real',
    q: 'mount',
  });
  expect(live.searchContentItems).toHaveBeenCalledWith({ q: 'unscoped' });
  expect(live.getContentItem).toHaveBeenCalledWith('module', 'real');
});

it('serves known demos locally and rejects unknown reserved refs without fallthrough', async () => {
  const { api, live } = setup();
  const ref = createDemoImages()[0].ref;
  await expect(api.getExecutionEnvironment(ref)).resolves.toMatchObject({
    ref,
  });
  await expect(api.getContents(ref)).resolves.toMatchObject({
    items: [],
    collections: [],
  });
  await expect(api.searchContentItems({ in: ref })).resolves.toEqual({
    items: [],
    totalItems: 0,
  });
  await expect(api.getContentItem('missing', ref)).rejects.toMatchObject({
    status: 404,
  });
  const unknown = 'demo.invalid/utopia/unknown';
  await expect(api.getExecutionEnvironment(unknown)).rejects.toBeInstanceOf(
    ContentApiError,
  );
  await expect(api.getContents(unknown)).rejects.toMatchObject({ status: 404 });
  await expect(api.searchContentItems({ in: unknown })).rejects.toMatchObject({
    status: 404,
  });
  await expect(api.getContentItem('missing', unknown)).rejects.toMatchObject({
    status: 404,
  });
  expect(live.getExecutionEnvironment).not.toHaveBeenCalled();
  expect(live.getContents).not.toHaveBeenCalled();
  expect(live.searchContentItems).not.toHaveBeenCalled();
  expect(live.getContentItem).not.toHaveBeenCalled();
});

it('blocks every registry mutation while the adapter is active', async () => {
  const { api, live } = setup();
  await expect(api.syncAll()).rejects.toThrow('disabled');
  await expect(api.syncRegistry('real')).rejects.toThrow('disabled');
  expect(live.syncAll).not.toHaveBeenCalled();
  expect(live.syncRegistry).not.toHaveBeenCalled();
});
