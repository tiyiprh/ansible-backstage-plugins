import { useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useParams, useSearchParams } from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import {
  Badge,
  Button,
  ButtonIcon,
  Card,
  CardBody,
  CellText,
  Container,
  Flex,
  Menu,
  MenuItem,
  MenuTrigger,
  Skeleton,
  Tab,
  TabList,
  TabPanel,
  Table,
  Tabs,
  Text,
  useTable,
  type ColumnConfig,
} from '@backstage/ui';
import {
  automationContentApiRef,
  ContentApiError,
  type ArtifactContents,
  type ContentCounts,
} from '../../api';
import { collectionsRouteRef, eeRouteRef } from '../../routes';
import { EmptyState, StatusBadge } from '../common';
import type { StatusBadgeTone } from '../common';
import { BreadcrumbsNavigation } from '../common/BreadcrumbsNavigation';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import {
  environmentHref,
  imageContentsSummary,
  matchesEnvironment,
  relativeTime,
  sourceLabel,
  syncStateLabel,
} from './catalogHelpers';
import styles from './details.module.css';
import { ContentItemDocumentation } from '../ContentItemDocumentation';
import { UseInControllerDialog } from './UseInControllerDialog';
import {
  getDemoImageMetadata,
  isDemoImageRef,
} from '../../development/metadata';
import { hasDemoImages } from '../../development/demoMode';

type IncludedCollection = ArtifactContents['collections'][number];
interface CollectionRow extends IncludedCollection {
  id: string;
}

function collectionEmptyCopy(
  contentsKnown: boolean,
  approximate: boolean,
): { title: string; description: string } {
  if (!contentsKnown) {
    return {
      title: 'Image contents are unknown',
      description:
        'No manifest is available; the image may still contain collections.',
    };
  }
  if (approximate) {
    return {
      title: 'No collections reported in this inventory',
      description:
        'This inventory is incomplete; the image may contain additional collections.',
    };
  }
  return {
    title: 'No collections are included in this execution environment',
    description:
      'Collections included in this image will appear here when they are available.',
  };
}

function collectionContentsSummary(
  counts: ContentCounts,
  contentsKnown: boolean,
  approximate: boolean,
): string {
  if (!contentsKnown) return 'Unknown';

  const countLabels: Array<{
    key: keyof Pick<
      ContentCounts,
      'plugins' | 'roles' | 'playbooks' | 'edaPlugins' | 'rulebooks'
    >;
    singular: string;
    plural: string;
  }> = [
    { key: 'plugins', singular: 'plugin', plural: 'plugins' },
    { key: 'roles', singular: 'role', plural: 'roles' },
    { key: 'playbooks', singular: 'playbook', plural: 'playbooks' },
    { key: 'edaPlugins', singular: 'EDA plugin', plural: 'EDA plugins' },
    { key: 'rulebooks', singular: 'rulebook', plural: 'rulebooks' },
  ];
  const reportedCounts = countLabels.flatMap(({ key, singular, plural }) => {
    const count = counts[key];
    if (count === undefined) return [];
    return [`${count} ${count === 1 ? singular : plural}`];
  });

  if (!reportedCounts.length) {
    return approximate ? 'Approximate: Not reported' : 'Not reported';
  }
  return `${approximate ? 'Approximate: ' : ''}${reportedCounts.join(', ')}`;
}

function statusBadgeTone(status: string): StatusBadgeTone {
  if (status === 'Available') return 'success';
  if (status === 'Failed') return 'danger';
  if (status === 'Stale') return 'warning';
  return 'info';
}

function classificationLabel(type: string | undefined): string {
  if (!type) return 'Unknown';
  return type
    .replace(/[-_]+/g, ' ')
    .replace(/^\w/, first => first.toUpperCase());
}

function inventorySourceLabel(origin: string): string {
  const labels: Record<string, string> = {
    'build-time-manifest': 'Build-time manifest',
    labels: 'Registry labels',
    'blob-fetch': 'Registry blob',
    'external-introspection': 'External introspection',
  };
  return labels[origin] ?? origin;
}

function registryDisplayLabel(registry: string): string {
  if (/[./:]/.test(registry)) return registry;
  return registry.replace(
    /(^|[-_])(\w)/g,
    (_, separator, character: string) =>
      `${separator ? ' ' : ''}${character.toUpperCase()}`,
  );
}

function inventoryStatusLabel(status: string): string {
  return status.replace(/^\w/, first => first.toUpperCase());
}

function imageSourceLabel(
  registry: string,
  metadata: NonNullable<ReturnType<typeof getDemoImageMetadata>> | undefined,
): string {
  if (metadata?.sourceType === 'definition-file') return 'Definition file';
  if (metadata?.sourceType === 'external-registry') return 'External registry';
  return sourceLabel(registry);
}

function MetadataRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <>
      <dt>
        <Text variant="body-medium" color="secondary">
          {label}
        </Text>
      </dt>
      <dd className={styles.metadataValue}>
        {typeof children === 'string' || typeof children === 'number' ? (
          <Text variant="body-medium">{children}</Text>
        ) : (
          children
        )}
      </dd>
    </>
  );
}

/** Artifact metadata and relationships, without definition-authoring or SCM actions. */
export function EEDetailsPage(): ReactElement {
  const { ref = '' } = useParams<{ ref: string }>();
  const api = useApi(automationContentApiRef);
  const catalog = useApi(catalogApiRef);
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const demoMode = hasDemoImages(api);
  const base = useRouteRef(eeRouteRef)();
  const collectionsBase = useRouteRef(collectionsRouteRef)();
  const [params, setParams] = useSearchParams();
  const selected = ['overview', 'collections'].includes(params.get('tab') ?? '')
    ? params.get('tab')!
    : 'overview';
  const [copyStatus, setCopyStatus] = useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [controllerOpen, setControllerOpen] = useState(false);
  const image = useAsyncRetry(
    () => api.getExecutionEnvironment(ref),
    [api, ref],
  );
  const demoImage = isDemoImageRef(ref);
  const demoMetadata = getDemoImageMetadata(ref);
  const digest = image.value?.digest;
  // Catalog-owned preferences are optional; they never gate artifact details.
  const entities = useAsyncRetry(async () => {
    if (!digest || demoImage) return { items: [] };
    return catalog.getEntities({
      filter: {
        kind: 'Component',
        'metadata.annotations.ansible.com/digest': [digest],
      },
    });
  }, [catalog, digest, demoImage]);
  const contents = useAsyncRetry(() => api.getContents(ref), [api, ref]);
  const data = useMemo(
    () =>
      contents.value?.collections.map(c => ({
        ...c,
        id: `${c.fqcn}:${c.version}`,
      })),
    [contents.value],
  );
  const table = useTable<CollectionRow>({
    mode: 'complete',
    data,
    paginationOptions: { pageSize: 10, pageSizeOptions: [10, 20, 50] },
  });
  const approximate =
    !image.value?.contentsKnown ||
    contents.value?.enumeration.status !== 'complete';
  const columns: ColumnConfig<CollectionRow>[] = [
    {
      id: 'name',
      label: 'Collection',
      isRowHeader: true,
      cell: c => (
        <CellText
          title={c.fqcn}
          href={`${collectionsBase}/${encodeURIComponent(
            c.namespace,
          )}/${encodeURIComponent(c.name)}?${new URLSearchParams({
            in: ref,
            version: c.version,
          })}`}
        />
      ),
    },
    {
      id: 'version',
      label: 'Version',
      cell: c => <CellText title={c.version} />,
    },
    {
      id: 'status',
      label: 'Status',
      cell: () => <CellText title="Not reported" />,
    },
    {
      id: 'publisher',
      label: 'Publisher',
      cell: () => <CellText title="Not reported" />,
    },
    {
      id: 'signing',
      label: 'Signing',
      cell: () => <CellText title="Not reported" />,
    },
    {
      id: 'source',
      label: 'Source',
      cell: () => <CellText title="Not reported" />,
    },
    {
      id: 'contents',
      label: 'Contents',
      cell: (c: CollectionRow) => (
        <CellText
          title={
            image.value
              ? collectionContentsSummary(
                  c.counts,
                  image.value.contentsKnown,
                  approximate,
                )
              : 'Unknown'
          }
        />
      ),
    },
  ];
  const value = image.value;
  const entity =
    value && entities.value?.items.find(e => matchesEnvironment(e, value));
  const classification = classificationLabel(
    value?.classification?.type ?? value?.type,
  );
  const emptyCollections = collectionEmptyCopy(
    value?.contentsKnown ?? false,
    approximate,
  );
  const itemFqcn = params.get('item');
  const syncImage = async (): Promise<void> => {
    if (!value || demoImage || demoMode) return;
    setSyncing(true);
    setSyncStatus('');
    try {
      await api.syncRegistry(value.registry);
      setSyncStatus('Sync started.');
      image.retry();
    } catch (error) {
      setSyncStatus(
        error instanceof ContentApiError && error.status === 403
          ? 'Sync access needed for this registry.'
          : 'Unable to sync this registry.',
      );
    } finally {
      setSyncing(false);
    }
  };
  const copyPullReference = async (): Promise<void> => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value.pullReference);
      setCopyStatus('Pull reference copied');
    } catch {
      setCopyStatus(
        'Unable to copy. Select and copy the pull reference above.',
      );
    }
  };
  if (itemFqcn) {
    return (
      <Container>
        <Flex direction="column" gap="4">
          <BreadcrumbsNavigation
            items={[
              { label: 'Execution environments', href: base },
              {
                label: value?.repository ?? ref,
                href: `${environmentHref(base, ref)}?tab=collections`,
              },
              { label: itemFqcn },
            ]}
          />
          <ContentItemDocumentation fqcn={itemFqcn} inArtifact={ref} />
        </Flex>
      </Container>
    );
  }
  return (
    <Container className={styles.detailContainer}>
      <Flex direction="column" gap="4">
        <BreadcrumbsNavigation
          items={[
            { label: 'Execution environments', href: base },
            { label: 'Images', href: `${base}/images` },
            { label: value?.repository ?? ref },
          ]}
        />
        <Flex
          className={styles.detailHeader}
          align="center"
          justify="between"
          gap="3"
        >
          <Text
            as="h1"
            variant="title-small"
            weight="bold"
            className={styles.title}
          >
            {value?.repository ?? 'Execution environment'}
          </Text>
          {value && (
            <MenuTrigger>
              <ButtonIcon
                variant="tertiary"
                icon={<MoreVertIcon />}
                aria-label={`Actions for ${value.repository}`}
              />
              <Menu>
                <MenuItem
                  isDisabled={demoImage}
                  onAction={() => {
                    if (!demoImage) setControllerOpen(true);
                  }}
                >
                  Use in Controller
                </MenuItem>
                <MenuItem
                  isDisabled={demoImage || demoMode}
                  onAction={() => void syncImage()}
                >
                  {syncing ? 'Syncing…' : 'Sync'}
                </MenuItem>
                {entity && (
                  <MenuItem onAction={() => toggleStarredEntity(entity)}>
                    {isStarredEntity(entity) ? 'Unfavorite' : 'Favorite'}
                  </MenuItem>
                )}
              </Menu>
            </MenuTrigger>
          )}
        </Flex>
        {entities.error && (
          <Text>
            Favorites are unavailable. Image details are still available.
          </Text>
        )}
        {image.loading && (
          <div aria-busy="true" aria-label="Loading image details">
            <Text role="status">Loading image details…</Text>
            <div aria-hidden="true">
              <Skeleton width="100%" height="4rem" />
              <Skeleton width="100%" height="12rem" />
            </div>
          </div>
        )}
        {image.error && (
          <div role="alert">
            {image.error instanceof ContentApiError &&
            image.error.status === 404
              ? 'This execution environment was not found. It may no longer be indexed.'
              : 'Unable to load this execution environment.'}{' '}
            <Button onPress={image.retry}>Retry</Button>
          </div>
        )}
        {syncStatus && <Text role="status">{syncStatus}</Text>}
        {value && (
          <Tabs
            selectedKey={selected}
            onSelectionChange={key => {
              const next = new URLSearchParams(params);
              next.set('tab', String(key));
              setParams(next);
            }}
          >
            <TabList aria-label="Execution environment details">
              <Tab id="overview">Overview</Tab>
              <Tab id="collections">Collections</Tab>
            </TabList>
            <TabPanel id="overview">
              <Card className={styles.detailSurface}>
                <CardBody className={styles.detailSurfaceBody}>
                  <dl className={styles.metadataGrid}>
                    <MetadataRow label="Registry">
                      {registryDisplayLabel(value.registry)}
                    </MetadataRow>
                    <MetadataRow label="Status">
                      <StatusBadge
                        tone={statusBadgeTone(
                          syncStateLabel(
                            value.lastReconciledAt,
                            value.lastReconcileOk,
                          ),
                        )}
                      >
                        {syncStateLabel(
                          value.lastReconciledAt,
                          value.lastReconcileOk,
                        )}
                      </StatusBadge>
                    </MetadataRow>
                    <MetadataRow label="Signing">Unknown</MetadataRow>
                    <MetadataRow label="Origin">
                      <Flex direction="column" align="start" gap="1">
                        <StatusBadge
                          tone={
                            imageSourceLabel(value.registry, demoMetadata) ===
                            'Definition file'
                              ? 'info'
                              : 'neutral'
                          }
                        >
                          {imageSourceLabel(value.registry, demoMetadata)}
                        </StatusBadge>
                      </Flex>
                    </MetadataRow>
                    <MetadataRow label="Tags">
                      <Flex gap="2" className={styles.wrapFlex}>
                        {value.tags.length ? (
                          value.tags.map(tag => <Badge key={tag}>{tag}</Badge>)
                        ) : (
                          <Text color="secondary">Untagged</Text>
                        )}
                      </Flex>
                    </MetadataRow>
                    <MetadataRow label="Digest">{value.digest}</MetadataRow>
                    <MetadataRow label="Last synchronized">
                      {relativeTime(value.lastReconciledAt)}
                    </MetadataRow>
                    <MetadataRow label="Contents">
                      <Flex direction="column" gap="1">
                        <Text>{imageContentsSummary(value)}</Text>
                        {!value.contentsKnown && (
                          <Text color="secondary">
                            This inventory is unavailable; the image may still
                            contain content.
                          </Text>
                        )}
                      </Flex>
                    </MetadataRow>
                    <MetadataRow label="Classification">
                      {classification}
                    </MetadataRow>
                    <MetadataRow label="Inventory status">
                      {inventoryStatusLabel(value.enumeration.status)}
                    </MetadataRow>
                    <MetadataRow label="Inventory source">
                      {inventorySourceLabel(value.enumeration.source)}
                    </MetadataRow>
                    <MetadataRow label="Ansible core">
                      {value.enumeration.ansibleCore ?? 'Unknown'}
                    </MetadataRow>
                    <MetadataRow label="Extracted at">
                      {value.enumeration.extractedAt ?? 'Unknown'}
                    </MetadataRow>
                  </dl>
                  <div className={styles.pullReferenceSection}>
                    <Text as="h2" variant="body-large" weight="bold">
                      Pull reference
                    </Text>
                    <Flex
                      align="start"
                      gap="2"
                      className={styles.pullReference}
                    >
                      <code className={styles.pullReferenceCode}>
                        {value.pullReference}
                      </code>
                      <ButtonIcon
                        variant="tertiary"
                        icon={<FileCopyIcon />}
                        aria-label="Copy pull reference"
                        onPress={copyPullReference}
                      />
                    </Flex>
                    {copyStatus && <Text role="status">{copyStatus}</Text>}
                  </div>
                </CardBody>
              </Card>
            </TabPanel>
            <TabPanel id="collections">
              {contents.error && (
                <div role="alert">
                  Unable to load image collections.{' '}
                  <Button onPress={contents.retry}>Retry</Button>
                </div>
              )}
              <Text>
                {contents.value?.enumeration.status ?? 'Unknown'} inventory ·{' '}
                {contents.value?.enumeration.source ?? 'Unknown source'}
              </Text>
              <Card className={styles.detailSurface}>
                <CardBody className={styles.detailSurfaceBody}>
                  <div aria-busy={contents.loading} className={styles.table}>
                    {!contents.error && (
                      <Table
                        {...table.tableProps}
                        isPending={contents.loading}
                        columnConfig={columns}
                        emptyState={
                          <EmptyState
                            title={emptyCollections.title}
                            description={emptyCollections.description}
                          />
                        }
                      />
                    )}
                  </div>
                </CardBody>
              </Card>
            </TabPanel>
          </Tabs>
        )}
        {controllerOpen && value && (
          <UseInControllerDialog
            open
            imageName={value.repository}
            pullReference={value.pullReference}
            onClose={() => setControllerOpen(false)}
          />
        )}
      </Flex>
    </Container>
  );
}
