import { ConfigApi } from '@backstage/core-plugin-api';
import { AutomationContentApi, AutomationContentClient } from '../api';
import { hasDemoImages, isDemoImagesEnabled } from './demoMode';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

it.each([
  ['development', true, true],
  ['development', false, false],
  ['development', undefined, false],
  ['production', true, false],
  ['test', true, false],
  [undefined, true, false],
])(
  'gates demo images for environment %s and setting %s',
  (env, setting, expected) => {
    if (env === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = env;
    }
    const getOptionalBoolean = jest.fn().mockReturnValue(setting);
    const config = { getOptionalBoolean } as unknown as ConfigApi;

    expect(isDemoImagesEnabled(config)).toBe(expected);
    expect(getOptionalBoolean.mock.calls).toEqual(
      env === 'development'
        ? [['automationContent.development.demoImages']]
        : [],
    );
  },
);

it('does not identify the real client as a demo API', () => {
  const client = new AutomationContentClient({
    discoveryApi: { getBaseUrl: jest.fn() },
    fetchApi: { fetch: jest.fn() },
  });
  expect(hasDemoImages(client)).toBe(false);
});

it.each([true, false, undefined, 'true', 1])(
  'recognizes only the exact true marker (%s)',
  marker => {
    const api = {
      developmentDemoImages: marker,
    } as unknown as AutomationContentApi;
    expect(hasDemoImages(api)).toBe(marker === true);
  },
);
