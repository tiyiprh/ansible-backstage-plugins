import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import type { Entity } from '@backstage/catalog-model';
import {
  catalogApiRef,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import {
  Button,
  ButtonIcon,
  Cell,
  CellText,
  Checkbox,
  ColumnConfig,
  Container,
  Flex,
  Link,
  Menu,
  MenuItem,
  MenuTrigger,
  SearchField,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import CheckCircleOutlineIcon from '@material-ui/icons/CheckCircleOutline';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import SyncIcon from '@material-ui/icons/Sync';
import WarningIcon from '@material-ui/icons/Warning';
import {
  automationContentApiRef,
  ContentApiError,
  type ExecutionEnvironment,
} from '../../api';
import { eeRouteRef } from '../../routes';
import { EmptyState, PageHeaderSection, StatusBadge } from '../common';
import type { StatusBadgeTone } from '../common';
import { UseInControllerDialog } from './UseInControllerDialog';
import {
  environmentHref,
  imageContentsSummary,
  matchesEnvironment,
  relativeTime,
  sourceLabel,
  syncStateLabel,
} from './catalogHelpers';
import styles from './details.module.css';
import {
  getDemoImageMetadata,
  isDemoImageRef,
} from '../../development/metadata';
import { hasDemoImages } from '../../development/demoMode';

interface ImageRow extends ExecutionEnvironment {
  id: string;
}

function displayRegistryName(registry: string): string {
  return registry.charAt(0).toUpperCase() + registry.slice(1);
}

function syncStatusTone(status: string): StatusBadgeTone {
  if (status === 'Available') return 'success';
  if (status === 'Failed') return 'danger';
  if (status === 'Stale') return 'warning';
  return 'info';
}

function imageSourceLabel(
  registry: string,
  metadata: NonNullable<ReturnType<typeof getDemoImageMetadata>> | undefined,
  definitionEntityRef?: string,
): string {
  if (definitionEntityRef) return 'Definition file';
  if (metadata?.sourceType === 'definition-file') return 'Definition file';
  if (metadata?.sourceType === 'external-registry') return 'External registry';
  return sourceLabel(registry);
}

/** Registry inventory with client-side search and optional catalog-owned stars. */
export function ImagesCatalogPage({
  showHeader = true,
  wrapInContainer = true,
}: {
  showHeader?: boolean;
  wrapInContainer?: boolean;
}): ReactElement {
  const api = useApi(automationContentApiRef);
  const demoMode = hasDemoImages(api);
  const catalog = useApi(catalogApiRef);
  const base = useRouteRef(eeRouteRef)();
  const navigate = useNavigate();
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const [starredOnly, setStarredOnly] = useState(false);
  const [allTypes, setAllTypes] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [syncError, setSyncError] = useState('');
  const [syncingRegistry, setSyncingRegistry] = useState('');
  const [controllerImage, setControllerImage] =
    useState<ExecutionEnvironment | null>(null);
  const images = useAsyncRetry(
    () => api.listExecutionEnvironments({ allTypes, page, perPage }),
    [api, allTypes, page, perPage],
  );
  const data = useMemo(
    () => images.value?.items.map(image => ({ ...image, id: image.ref })),
    [images.value],
  );

  // Catalog failure must never hide backend inventory. Only fetch candidates
  // for this page; annotation values are ORed within the digest filter.
  const entities = useAsyncRetry(async () => {
    const realImages = data?.filter(image => !isDemoImageRef(image.ref)) ?? [];
    if (!realImages.length) return { items: [] };
    return catalog.getEntities({
      filter: {
        kind: 'Component',
        'metadata.annotations.ansible.com/digest': [
          ...new Set(realImages.map(image => image.digest)),
        ],
      },
    });
  }, [catalog, data]);

  const entityByImageRef = useMemo(() => {
    const linked = new Map<string, Entity>();
    for (const image of data ?? []) {
      if (isDemoImageRef(image.ref)) continue;
      const entity = entities.value?.items.find(candidate =>
        matchesEnvironment(candidate, image),
      );
      if (entity) linked.set(image.ref, entity);
    }
    return linked;
  }, [data, entities.value]);

  const table = useTable<ImageRow>({
    mode: 'complete',
    data,
    filter: starredOnly,
    filterFn: (rows, only) =>
      only
        ? rows.filter(row => {
            const entity = entityByImageRef.get(row.ref);
            return entity && isStarredEntity(entity);
          })
        : rows,
    searchFn: (rows, query) =>
      rows.filter(row =>
        [
          row.repository,
          row.registry,
          row.digest,
          ...row.tags,
          row.classification?.type ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    // Search and favorites filter the fetched page, not the whole inventory.
    paginationOptions: { type: 'none' },
  });

  const syncRegistry = async (registry: string): Promise<void> => {
    if (demoMode) return;
    setSyncingRegistry(registry);
    setSyncError('');
    try {
      const result = await api.syncRegistry(registry);
      if (result.status === 'failed') {
        setSyncError(
          result.retainedPrevious
            ? `Sync failed for ${displayRegistryName(
                registry,
              )}. Previously indexed content is still shown.`
            : `Unable to sync ${displayRegistryName(registry)}.`,
        );
      }
      images.retry();
    } catch (error) {
      setSyncError(
        error instanceof ContentApiError && error.status === 403
          ? `Sync access needed for ${displayRegistryName(registry)}.`
          : `Unable to sync ${displayRegistryName(registry)}.`,
      );
    } finally {
      setSyncingRegistry('');
    }
  };

  const columns: ColumnConfig<ImageRow>[] = [
    {
      id: 'image',
      label: 'Image',
      isRowHeader: true,
      cell: row => (
        <Cell>
          <Flex align="center" gap="2" className={styles.wrapFlex}>
            <Link
              href={environmentHref(base, row.ref)}
              color="info"
              className={styles.infoLink}
            >
              {row.repository}
            </Link>
          </Flex>
        </Cell>
      ),
    },
    {
      id: 'source',
      label: 'Source',
      cell: row => {
        const demoMetadata = getDemoImageMetadata(row.ref);
        const source = imageSourceLabel(
          row.registry,
          demoMetadata,
          row.definitionEntityRef,
        );
        return (
          <Cell>
            <Flex direction="column" align="start" gap="1">
              {row.registry && <Text>{displayRegistryName(row.registry)}</Text>}
              <StatusBadge
                tone={source === 'Definition file' ? 'info' : 'neutral'}
              >
                {source}
              </StatusBadge>
            </Flex>
          </Cell>
        );
      },
    },
    {
      id: 'contents',
      label: 'Contents',
      cell: row => <CellText title={imageContentsSummary(row)} />,
    },
    {
      id: 'status',
      label: 'Status',
      cell: row => {
        const status = syncStateLabel(
          row.lastReconciledAt,
          row.lastReconcileOk,
        );
        let statusIcon: ReactElement;
        if (status === 'Available') {
          statusIcon = <CheckCircleOutlineIcon aria-hidden="true" />;
        } else if (status === 'Syncing') {
          statusIcon = <SyncIcon aria-hidden="true" />;
        } else if (status === 'Stale') {
          statusIcon = <WarningIcon aria-hidden="true" />;
        } else if (status === 'Failed') {
          statusIcon = <ErrorOutlineIcon aria-hidden="true" />;
        } else {
          statusIcon = <InfoOutlinedIcon aria-hidden="true" />;
        }
        return (
          <Cell>
            <StatusBadge
              tone={syncStatusTone(status)}
              size="small"
              variant="outline"
              icon={statusIcon}
            >
              {status}
            </StatusBadge>
          </Cell>
        );
      },
    },
    {
      id: 'last-synced',
      label: 'Last synced',
      cell: row => <CellText title={relativeTime(row.lastReconciledAt)} />,
    },
    {
      id: 'actions',
      label: 'Actions',
      cell: row => {
        const demoImage = isDemoImageRef(row.ref);
        const entity = entityByImageRef.get(row.ref);
        const starred = entity ? isStarredEntity(entity) : false;
        return (
          <Cell>
            <Flex align="center" gap="1">
              {entity && !demoImage && (
                <ButtonIcon
                  variant="tertiary"
                  icon={starred ? <StarIcon /> : <StarBorderIcon />}
                  aria-pressed={starred}
                  aria-label={`${starred ? 'Remove' : 'Add'} ${
                    row.repository
                  } ${starred ? 'from' : 'to'} favorites`}
                  onPress={() => toggleStarredEntity(entity)}
                />
              )}
              <MenuTrigger>
                <ButtonIcon
                  variant="tertiary"
                  icon={<MoreVertIcon />}
                  aria-label={`Actions for ${row.repository}`}
                />
                <Menu>
                  <MenuItem
                    isDisabled={demoImage}
                    onAction={() => {
                      if (!demoImage) setControllerImage(row);
                    }}
                  >
                    Use in Controller
                  </MenuItem>
                  <MenuItem
                    isDisabled={demoImage || demoMode}
                    onAction={() => {
                      if (!demoImage && !demoMode) {
                        void syncRegistry(row.registry);
                      }
                    }}
                  >
                    {syncingRegistry === row.registry ? 'Syncing…' : 'Sync'}
                  </MenuItem>
                  <MenuItem
                    onAction={() => navigate(environmentHref(base, row.ref))}
                  >
                    View details
                  </MenuItem>
                </Menu>
              </MenuTrigger>
            </Flex>
          </Cell>
        );
      },
    },
  ];

  const content = (
    <Flex direction="column" gap="4">
      {showHeader && (
        <PageHeaderSection
          title="Execution environments"
          description="Discover immutable images from configured registries and inspect their Ansible content."
        />
      )}
      <Flex direction="column" gap="3">
        <Flex
          align="center"
          justify="between"
          gap="3"
          className={styles.searchToolbar}
        >
          <SearchField
            aria-label="Search images"
            placeholder="Search images"
            value={table.search.value}
            onChange={table.search.onChange}
          />
          <Flex align="center" gap="3" className={styles.wrapFlex}>
            <Checkbox isSelected={starredOnly} onChange={setStarredOnly}>
              Favorites only
            </Checkbox>
            <Checkbox
              isSelected={allTypes}
              onChange={value => {
                setPage(1);
                setAllTypes(value);
              }}
            >
              Show all images
            </Checkbox>
          </Flex>
        </Flex>
        {syncError && <Text role="alert">{syncError}</Text>}
        <Text as="h2" variant="title-medium">
          Execution environment images
          {images.value ? ` (${images.value.totalItems})` : ''}
        </Text>
        {images.error && (
          <div role="alert">
            Unable to load execution environments.{' '}
            <Button onPress={images.retry}>Retry</Button>
          </div>
        )}
        {entities.error && (
          <Text>Catalog links are unavailable. Favorites may be missing.</Text>
        )}
        {!images.loading && !images.error && images.value && (
          <Text aria-live="polite">{data?.length ?? 0} images loaded</Text>
        )}
        <div aria-busy={images.loading} className={styles.table}>
          {!images.error && (
            <Table
              {...table.tableProps}
              pagination={{
                type: 'page',
                pageSize: perPage,
                pageSizeOptions: [10, 20, 50],
                showPageSizeOptions: true,
                onPageSizeChange: size => {
                  setPerPage(size);
                  setPage(1);
                },
                offset: ((images.value?.page ?? page) - 1) * perPage,
                totalCount: images.value?.totalItems ?? 0,
                hasNextPage:
                  !images.loading &&
                  page * perPage < (images.value?.totalItems ?? 0),
                hasPreviousPage: !images.loading && page > 1,
                onNextPage: () => setPage(current => current + 1),
                onPreviousPage: () => setPage(current => current - 1),
              }}
              isPending={images.loading}
              columnConfig={columns}
              emptyState={
                <EmptyState
                  title={
                    data?.length
                      ? 'No images match your search or filters'
                      : 'No execution environments discovered'
                  }
                  description={
                    data?.length
                      ? 'Change your search or favorites filter.'
                      : 'Images appear after configured registries are reconciled.'
                  }
                  action={
                    data?.length ? (
                      <Button
                        variant="secondary"
                        onPress={() => {
                          table.search.onChange('');
                          setStarredOnly(false);
                        }}
                      >
                        Clear search and filters
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          )}
        </div>
      </Flex>
      {controllerImage && (
        <UseInControllerDialog
          open
          imageName={controllerImage.repository}
          pullReference={controllerImage.pullReference}
          onClose={() => setControllerImage(null)}
        />
      )}
    </Flex>
  );
  return wrapInContainer ? <Container>{content}</Container> : content;
}
