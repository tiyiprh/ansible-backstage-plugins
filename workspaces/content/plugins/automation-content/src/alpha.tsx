import {
  ApiBlueprint,
  PageBlueprint,
  createFrontendPlugin,
  type FrontendPlugin,
} from '@backstage/frontend-plugin-api';
import {
  compatWrapper,
  convertLegacyRouteRef,
} from '@backstage/core-compat-api';
import { automationContentApiFactory } from './apis';
import { Navigate } from 'react-router-dom';
import BuildIcon from '@material-ui/icons/Build';
import ExtensionIcon from '@material-ui/icons/Extension';
import {
  eeRouteRef,
  eeDetailsRouteRef,
  collectionsRouteRef,
  collectionDetailsRouteRef,
} from './routes';

/** Native discovery lets hosts mount content catalogs without legacy app wiring. */
export const automationContentPlugin: FrontendPlugin = createFrontendPlugin({
  pluginId: 'automation-content',
  title: 'Automation content',
  routes: {
    ee: convertLegacyRouteRef(eeRouteRef),
    eeDetails: convertLegacyRouteRef(eeDetailsRouteRef),
    collections: convertLegacyRouteRef(collectionsRouteRef),
    collectionDetails: convertLegacyRouteRef(collectionDetailsRouteRef),
  },
  extensions: [
    ApiBlueprint.make({
      name: 'content',
      params: define => define(automationContentApiFactory),
    }),
    PageBlueprint.make({
      name: 'content-redirect',
      params: {
        path: '/content',
        loader: async () =>
          compatWrapper(<Navigate to="/content/ee" replace />),
      },
    }),
    PageBlueprint.make({
      name: 'root-redirect',
      params: {
        // Compatibility redirect: the plugin's original mount prefix.
        path: '/automation-content',
        loader: async () =>
          compatWrapper(<Navigate to="/content/ee" replace />),
      },
    }),
    PageBlueprint.make({
      name: 'ee',
      params: {
        // Content-workspace mount at /content/ee per the 2026-11-02 sync,
        // endorsed by Ganesh; portal-scaffolder remains untouched.
        path: '/content/ee',
        title: 'Execution Environments',
        icon: <BuildIcon />,
        noHeader: true,
        routeRef: convertLegacyRouteRef(eeRouteRef),
        loader: async () => {
          const { EERoutesPage } = await import(
            './components/ExecutionEnvironments/EERoutesPage'
          );
          return compatWrapper(<EERoutesPage />);
        },
      },
    }),
    PageBlueprint.make({
      name: 'ee-redirect',
      params: {
        path: '/automation-content/execution-environments',
        loader: async () =>
          compatWrapper(<Navigate to="/content/ee" replace />),
      },
    }),
    PageBlueprint.make({
      name: 'collections',
      params: {
        // Provisional self-service mount per the 2026-10-30 sync decision,
        // pending the Ganesh workspace-permissions consult.
        path: '/self-service/collections',
        title: 'Collections',
        icon: <ExtensionIcon />,
        noHeader: true,
        routeRef: convertLegacyRouteRef(collectionsRouteRef),
        loader: async () => {
          const { CollectionsRoutesPage } = await import(
            './components/CollectionsCatalog/CollectionsRoutesPage'
          );
          return compatWrapper(<CollectionsRoutesPage />);
        },
      },
    }),
    PageBlueprint.make({
      name: 'collections-redirect',
      params: {
        path: '/automation-content/collections',
        loader: async () =>
          compatWrapper(<Navigate to="/self-service/collections" replace />),
      },
    }),
    PageBlueprint.make({
      name: 'collection-details',
      params: {
        path: '/self-service/collections/:namespace/:name',
        title: 'Collection details',
        noHeader: true,
        loader: async () => {
          const { CollectionDetailsPage } = await import(
            './components/CollectionsCatalog/CollectionDetailsPage'
          );
          return compatWrapper(<CollectionDetailsPage />);
        },
      },
    }),
  ],
});

export default automationContentPlugin;
