import {
  configApiRef,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
  type ApiFactory,
  type ConfigApi,
  type DiscoveryApi,
  type FetchApi,
} from '@backstage/core-plugin-api';
import {
  AutomationContentClient,
  automationContentApiRef,
  type AutomationContentApi,
} from './api';
import { createDemoApi } from './development/demoApi';
import { isDemoImagesEnabled } from './development/demoMode';

/** Authenticated content discovery shared by native and legacy frontend hosts. */
export const automationContentApiFactory: ApiFactory<
  AutomationContentApi,
  AutomationContentApi,
  {
    configApi: ConfigApi;
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
  }
> = createApiFactory({
  api: automationContentApiRef,
  deps: {
    configApi: configApiRef,
    discoveryApi: discoveryApiRef,
    fetchApi: fetchApiRef,
  },
  factory: ({ configApi, discoveryApi, fetchApi }) => {
    const client = new AutomationContentClient({ discoveryApi, fetchApi });
    if (isDemoImagesEnabled(configApi)) {
      const sourceRef = configApi.getOptionalString(
        'automationContent.development.sourceRef',
      );
      return createDemoApi(client, sourceRef);
    }
    return client;
  },
});
