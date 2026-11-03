import { useEffect, useState, type ReactElement } from 'react';
import SyncIcon from '@material-ui/icons/Sync';
import { Box, Button, Flex, Tab, TabList, TabPanel, Tabs } from '@backstage/ui';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
  useIsSuperuser,
} from '@ansible/portal-plugin-sdk';
import { ImageSyncDialog } from './catalog/ImageSyncDialog';
import { RegistrySyncButton } from './RegistrySyncButton';
import { useRouteRef } from '@backstage/core-plugin-api';
import { eeRouteRef } from '../../routes';
import { CreateContent } from './CreateContent';
import { DefinitionFilesCatalogPage } from './DefinitionFilesCatalogPage';
import { ImagesCatalogPage } from './ImagesCatalogPage';
import { PageHeaderSection } from '../common';
import styles from './EECatalogPage.module.css';

export type EECatalogView = 'images' | 'catalog';

/** Shared EE catalog shell keeps each prototype tab addressable by its route. */
function EETabs({ view }: { view: EECatalogView }): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const eeBase = useRouteRef(eeRouteRef)();
  const { notifications, removeNotification } = useNotifications();
  const { isSuperuser } = useIsSuperuser();
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [syncVersion, setSyncVersion] = useState(0);
  useEffect(() => {
    const tabIndex = (location.state as { tabIndex?: number })?.tabIndex;
    const path =
      tabIndex === undefined
        ? undefined
        : ['images', 'catalog', 'create'][tabIndex];
    if (path) navigate(`${eeBase}/${path}`, { replace: true, state: {} });
  }, [location.state, navigate, eeBase]);

  return (
    <Box className={styles.pageFrame} data-testid="ee-catalog-frame">
      <Box className={styles.pageSurface} data-testid="ee-catalog-surface">
        <Flex
          direction="column"
          gap="4"
          px="5"
          py="3"
          className={styles.pageContent}
        >
          <NotificationStack
            notifications={notifications}
            onClose={removeNotification}
          />
          <PageHeaderSection
            title="Execution Environments"
            description="Browse and manage execution environment images and definition files, or create a new EE definition for your automation workflows."
            tooltip="Execution environment images and definition files available to the portal."
            actions={
              <>
                {view === 'images' && (
                  <Flex align="center" gap="2">
                    <Button
                      variant="primary"
                      onPress={() => navigate(`${eeBase}/create`)}
                    >
                      Create execution environment
                    </Button>
                    <RegistrySyncButton
                      onStatus={setSyncStatus}
                      onSynced={() => setSyncVersion(version => version + 1)}
                    />
                  </Flex>
                )}
                {view !== 'images' && isSuperuser && (
                  <Flex align="center" gap="2">
                    <Button
                      variant="secondary"
                      iconStart={<SyncIcon />}
                      onPress={() => setSyncDialogOpen(true)}
                    >
                      Sync Now
                    </Button>
                  </Flex>
                )}
              </>
            }
            status={syncStatus}
          />
          <Tabs
            selectedKey={view}
            onSelectionChange={key => navigate(`${eeBase}/${key}`)}
          >
            <TabList aria-label="Execution environment catalogs">
              <Tab id="images">Execution environments</Tab>
              <Tab id="catalog">Definition files</Tab>
            </TabList>
            <TabPanel id="images">
              {view === 'images' && (
                <ImagesCatalogPage
                  key={syncVersion}
                  showHeader={false}
                  wrapInContainer={false}
                />
              )}
            </TabPanel>
            <TabPanel id="catalog">
              {view === 'catalog' && <DefinitionFilesCatalogPage />}
            </TabPanel>
            <TabPanel id="create">
              {view === 'create' && <CreateContent />}
            </TabPanel>
          </Tabs>
          <ImageSyncDialog
            open={syncDialogOpen}
            onClose={() => setSyncDialogOpen(false)}
            onSynced={status => {
              setSyncStatus(status);
              setSyncVersion(version => version + 1);
            }}
          />
        </Flex>
      </Box>
    </Box>
  );
}

/** Route-bound port of the prototype tab view. */
export function EECatalogPage({ view }: { view: EECatalogView }): ReactElement {
  return (
    <NotificationProvider>
      <EETabs view={view} />
    </NotificationProvider>
  );
}
