import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReactElement } from 'react';
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
  Menu,
  MenuItem,
  MenuTrigger,
  Select,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { automationContentApiRef, type ExecutionEnvironment } from '../../api';
import { eeRouteRef } from '../../routes';
import {
  CatalogExplorerLayout,
  EmptyState,
  PageHeaderSection,
} from '../common';
import {
  environmentHref,
  imageContentsSummary,
  matchesEnvironment,
  relativeTime,
} from './catalogHelpers';
import styles from './details.module.css';

interface ImageRow extends ExecutionEnvironment {
  id: string;
}

/** Registry inventory with client-side filtering and optional catalog-owned stars. */
export function ImagesCatalogPage({
  showHeader = true,
  wrapInContainer = true,
}: {
  showHeader?: boolean;
  wrapInContainer?: boolean;
}): ReactElement {
  const api = useApi(automationContentApiRef);
  const catalog = useApi(catalogApiRef);
  const base = useRouteRef(eeRouteRef)();
  const navigate = useNavigate();
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const [starredOnly, setStarredOnly] = useState(false);
  const [allTypes, setAllTypes] = useState(false);
  const [source, setSource] = useState('all');
  const [tag, setTag] = useState('all');
  const [page, setPage] = useState(1);
  const images = useAsyncRetry(
    () => api.listExecutionEnvironments({ allTypes, page }),
    [api, allTypes, page],
  );
  // Catalog failure must never hide backend inventory.
  const entities = useAsyncRetry(
    () => catalog.getEntities({ filter: { kind: 'Component' } }),
    [catalog],
  );
  const data = useMemo(
    () => images.value?.items.map(image => ({ ...image, id: image.ref })),
    [images.value],
  );

  const entityByImageRef = useMemo(() => {
    const linked = new Map<string, Entity>();
    for (const image of data ?? []) {
      const entity = entities.value?.items.find(candidate =>
        matchesEnvironment(candidate, image),
      );
      if (entity) linked.set(image.ref, entity);
    }
    return linked;
  }, [data, entities.value]);

  const sources = useMemo(
    () => [...new Set((data ?? []).map(image => image.registry))].sort(),
    [data],
  );
  const tags = useMemo(
    () =>
      allTypes
        ? [...new Set((data ?? []).flatMap(image => image.tags))].sort()
        : [],
    [allTypes, data],
  );

  // These facets filter only the currently fetched page; server-side filtering is not available yet.
  const filteredData = useMemo(
    () =>
      (data ?? []).filter(image => {
        return (
          (source === 'all' || image.registry === source) &&
          (tag === 'all' || image.tags.includes(tag))
        );
      }),
    [data, source, tag],
  );

  const table = useTable<ImageRow>({
    mode: 'complete',
    data: filteredData,
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
  /** Row sync state, derived from the owning registry's last read. */
  const syncStateLabel = (
    lastReconciledAt?: string,
    lastReconcileOk?: boolean,
  ): string => {
    if (!lastReconciledAt) return 'Pending';
    if (lastReconcileOk === false) return 'Sync failed';
    return 'Synced';
  };

  const columns: ColumnConfig<ImageRow>[] = [
    {
      id: 'image',
      label: 'Image',
      isRowHeader: true,
      cell: row => (
        <CellText
          title={row.repository}
          href={environmentHref(base, row.ref)}
        />
      ),
    },
    {
      id: 'source',
      label: 'Source',
      cell: row => (
        // Ran/Tina combination: the actual source name with its type beneath.
        // Definition-file artifacts — when that integration exists — render
        // only "Definition file", with no registry name above them.
        <CellText title={row.registry} description="external registry" />
      ),
    },
    {
      id: 'tags',
      label: 'Tags / digest',
      cell: row => (
        <CellText
          title={row.tags.join(', ') || 'Untagged'}
          description={row.digest.slice(0, 19)}
        />
      ),
    },
    {
      id: 'contents',
      label: 'Contents',
      cell: row => <CellText title={imageContentsSummary(row)} />,
    },
    {
      id: 'state',
      label: 'State',
      cell: row => (
        <CellText
          title={syncStateLabel(row.lastReconciledAt, row.lastReconcileOk)}
        />
      ),
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
        const entity = entityByImageRef.get(row.ref);
        const starred = entity ? isStarredEntity(entity) : false;
        return (
          <Cell>
            <MenuTrigger>
              <ButtonIcon
                variant="tertiary"
                icon={<MoreVertIcon />}
                aria-label={`Actions for ${row.repository}`}
              />
              <Menu>
                {entity && (
                  <MenuItem onAction={() => toggleStarredEntity(entity)}>{`${
                    starred ? 'Remove from' : 'Add to'
                  } favorites`}</MenuItem>
                )}
                <MenuItem
                  onAction={() =>
                    navigator.clipboard?.writeText(row.pullReference)
                  }
                >
                  Copy pull reference
                </MenuItem>
                <MenuItem
                  onAction={() => navigate(environmentHref(base, row.ref))}
                >
                  View details
                </MenuItem>
              </Menu>
            </MenuTrigger>
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
      <CatalogExplorerLayout
        search="Search images"
        searchValue={table.search.value}
        onSearchChange={table.search.onChange}
        filters={
          <>
            <Select
              aria-label="Filter by source"
              size="small"
              value={source}
              onChange={value => setSource(String(value))}
              options={[
                { value: 'all', label: 'All sources' },
                ...sources.map(value => ({ value, label: value })),
              ]}
            />
            <Select
              aria-label="Filter by tag"
              size="small"
              value={tag}
              isDisabled={!allTypes}
              onChange={value => setTag(String(value))}
              options={[
                { value: 'all', label: 'All tags' },
                ...tags.map(value => ({ value, label: value })),
              ]}
            />
            <Checkbox isSelected={starredOnly} onChange={setStarredOnly}>
              Favorites only
            </Checkbox>
            <Checkbox
              isSelected={allTypes}
              onChange={value => {
                setPage(1);
                setAllTypes(value);
                if (!value) setTag('all');
              }}
            >
              Show all images
            </Checkbox>
          </>
        }
      >
        <Text as="h2" variant="title-medium">
          Execution Environments images
          {images.value
            ? ` (${images.value.totalItems ?? images.value.items.length})`
            : ''}
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
                // Page size is server-fixed at 10 until PR #1023 gains a pageSize param.
                pageSize: 10,
                pageSizeOptions: [],
                offset: ((images.value?.page ?? page) - 1) * 10,
                // Older backends (pre-#1023) return no envelope; fall back to the page's
                // own length so the total is honest, if partial, against them.
                totalCount:
                  images.value?.totalItems ?? images.value?.items.length ?? 0,
                hasNextPage:
                  !images.loading &&
                  page * 10 <
                    (images.value?.totalItems ??
                      images.value?.items.length ??
                      0),
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
                      ? 'No images match your filters'
                      : 'No execution environments discovered'
                  }
                  description={
                    data?.length
                      ? 'Change your search or filters.'
                      : 'Images appear after configured registries are reconciled.'
                  }
                  action={
                    data?.length ? (
                      <Button
                        variant="secondary"
                        onPress={() => {
                          table.search.onChange('');
                          setStarredOnly(false);
                          setSource('all');
                          setTag('all');
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          )}
        </div>
      </CatalogExplorerLayout>
    </Flex>
  );
  return wrapInContainer ? <Container>{content}</Container> : content;
}
