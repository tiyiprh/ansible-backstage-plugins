import { ConfigApi } from '@backstage/core-plugin-api';
import { AutomationContentApi } from '../api';

/** Demo images require explicit opt-in and are never enabled outside development. */
export function isDemoImagesEnabled(config: ConfigApi): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    config.getOptionalBoolean('automationContent.development.demoImages') ===
      true
  );
}

/** Detect the readonly marker supplied by the development demo API. */
export function hasDemoImages(
  api: AutomationContentApi,
): api is AutomationContentApi & { readonly developmentDemoImages: true } {
  return 'developmentDemoImages' in api && api.developmentDemoImages === true;
}
