import {
  ConfigApi,
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { AutomationContentClient, automationContentApiRef } from './api';
import { automationContentApiFactory } from './apis';
import { createDemoImages } from './development/fixtures';
import { hasDemoImages } from './development/demoMode';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

it('wires discovery and authenticated fetch to the content client', async () => {
  process.env.NODE_ENV = 'development';
  const configApi = {
    getOptionalBoolean: jest.fn().mockReturnValue(undefined),
    getOptionalString: jest.fn(),
  } as unknown as ConfigApi;
  const discoveryApi = { getBaseUrl: jest.fn().mockResolvedValue('/backend') };
  const fetchApi = {
    fetch: jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    }),
  };
  expect(automationContentApiFactory.api).toBe(automationContentApiRef);
  expect(automationContentApiFactory.deps).toEqual({
    configApi: configApiRef,
    discoveryApi: discoveryApiRef,
    fetchApi: fetchApiRef,
  });
  const client = automationContentApiFactory.factory({
    configApi,
    discoveryApi,
    fetchApi,
  });
  expect(client).toBeInstanceOf(AutomationContentClient);
  expect(hasDemoImages(client)).toBe(false);
  expect(configApi.getOptionalString).not.toHaveBeenCalled();
  await expect(client.listRegistries()).resolves.toEqual([]);
  expect(discoveryApi.getBaseUrl).toHaveBeenCalledWith('automation-content');
  expect(fetchApi.fetch).toHaveBeenCalledWith('/backend/registries');
});

it.each([
  ['development', true],
  ['production', false],
])('gates the demo wrapper in %s', (environment, enabled) => {
  process.env.NODE_ENV = environment;
  const configApi = {
    getOptionalBoolean: jest.fn().mockReturnValue(true),
    getOptionalString: jest.fn(),
  } as unknown as ConfigApi;
  const client = automationContentApiFactory.factory({
    configApi,
    discoveryApi: { getBaseUrl: jest.fn() },
    fetchApi: { fetch: jest.fn() },
  });

  expect(hasDemoImages(client)).toBe(enabled);
  expect(client instanceof AutomationContentClient).toBe(!enabled);
  expect(configApi.getOptionalString).toHaveBeenCalledTimes(enabled ? 1 : 0);
});

it('forwards the configured source reference to the enabled demo wrapper', async () => {
  process.env.NODE_ENV = 'development';
  const sourceRef = 'registry.example.com/demo/image:latest';
  const source = { ...createDemoImages()[0], ref: sourceRef };
  const fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => source });
  const configApi = {
    getOptionalBoolean: jest.fn().mockReturnValue(true),
    getOptionalString: jest.fn().mockReturnValue(sourceRef),
  } as unknown as ConfigApi;

  const api = automationContentApiFactory.factory({
    configApi,
    discoveryApi: { getBaseUrl: jest.fn().mockResolvedValue('/backend') },
    fetchApi: { fetch },
  });

  expect(configApi.getOptionalString).toHaveBeenCalledWith(
    'automationContent.development.sourceRef',
  );
  await api.getExecutionEnvironment(createDemoImages()[0].ref);
  expect(fetch).toHaveBeenCalledWith(
    `/backend/content/${encodeURIComponent(sourceRef)}`,
  );
});
