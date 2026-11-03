import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  EntityKindFilter,
  EntityListProvider,
  EntityTagFilter,
  EntityTextFilter,
  EntityTypeFilter,
  EntityUserFilter,
  useEntityList,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import { TemplateGroups } from '@backstage/plugin-scaffolder-react/alpha';
import type { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import { Box, Flex, Grid, SearchField, Select } from '@backstage/ui';
import {
  makeStyles,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
} from '@material-ui/core';
import { WizardCard } from './create/WizardCard';
import { TagFilterPicker } from '../utils/TagFilterPicker';

const mockExecutionEnvironmentTemplates: TemplateEntityV1beta3[] = [
  {
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: {
      name: 'local-ee-wizard-demo',
      namespace: 'default',
      title: 'Build an execution environment',
      description:
        'Build a local execution environment from a base image and selected Ansible content.',
      tags: ['execution-environment', 'local-demo'],
    },
    spec: { owner: 'user:development/guest', type: 'execution-environment' },
  },
  {
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: {
      name: 'local-ee-wizard-demo',
      namespace: 'default',
      title: 'Create a minimal execution environment',
      description:
        'Start with a lightweight base image and add only the content you need.',
      tags: ['execution-environment', 'minimal'],
    },
    spec: { owner: 'user:development/guest', type: 'execution-environment' },
  },
  {
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: {
      name: 'local-ee-wizard-demo',
      namespace: 'default',
      title: 'Create an automation-ready environment',
      description:
        'Prepare an execution environment with the collections used by your automation team.',
      tags: ['execution-environment', 'collections'],
    },
    spec: { owner: 'user:development/guest', type: 'execution-environment' },
  },
  {
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: {
      name: 'local-ee-wizard-demo',
      namespace: 'default',
      title: 'Create a network automation environment',
      description:
        'Build an environment with the content needed for network automation workflows.',
      tags: ['execution-environment', 'networking'],
    },
    spec: { owner: 'group:network-automation', type: 'execution-environment' },
  },
  {
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: {
      name: 'local-ee-wizard-demo',
      namespace: 'default',
      title: 'Create a security automation environment',
      description:
        'Start with a security-focused base and add approved Ansible content.',
      tags: ['execution-environment', 'security'],
    },
    spec: { owner: 'group:security-automation', type: 'execution-environment' },
  },
  {
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: {
      name: 'local-ee-wizard-demo',
      namespace: 'default',
      title: 'Create a platform engineering environment',
      description:
        'Prepare a reusable environment for platform engineering teams.',
      tags: ['execution-environment', 'platform'],
    },
    spec: {
      owner: 'group:platform-engineering',
      type: 'execution-environment',
    },
  },
];

const useTemplateTableStyles = makeStyles(() => ({
  row: {
    cursor: 'pointer',
    transition: 'background-color 120ms ease, box-shadow 120ms ease',
    '&:hover': {
      backgroundColor: 'rgba(144, 202, 249, 0.24) !important',
      boxShadow: 'inset 4px 0 0 #8fc7ff',
    },
  },
  selectedRow: {
    backgroundColor: 'rgba(144, 202, 249, 0.32) !important',
    boxShadow: 'inset 4px 0 0 #8fc7ff',
  },
}));

function EETagPicker() {
  const { backendEntities, filters, updateFilters } = useEntityList();
  const selectedTags = (filters.tags as EntityTagFilter)?.values ?? [];
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const entity of backendEntities) {
      const templateEntity = entity as TemplateEntityV1beta3;
      if (templateEntity.spec?.type?.includes('execution-environment')) {
        for (const tag of entity.metadata?.tags || []) tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [backendEntities]);
  if (!availableTags.length) return null;
  return (
    <TagFilterPicker
      label="Tags"
      options={availableTags}
      value={selectedTags}
      onChange={value =>
        updateFilters({
          ...filters,
          tags: value.length ? new EntityTagFilter(value) : undefined,
        })
      }
    />
  );
}

function ExecutionEnvironmentTypeFilter() {
  const { filters, updateFilters } = useEntityList();
  useEffect(() => {
    if (!filters.type)
      updateFilters({
        ...filters,
        kind: new EntityKindFilter('Template', 'Template'),
        type: new EntityTypeFilter(['execution-environment']),
      });
  }, [filters, updateFilters]);
  return null;
}

function TemplateFilters() {
  const { filters, updateFilters } = useEntityList();
  const { starredEntities } = useStarredEntities();
  return (
    <Flex direction="column" gap="3">
      <div data-testid="search-bar-container">
        <SearchField
          label="Search"
          value={filters.text?.value ?? ''}
          onChange={value =>
            updateFilters({
              text: value ? new EntityTextFilter(value) : undefined,
            })
          }
        />
      </div>
      <div data-testid="user-picker-container">
        <Select
          label="Favorites"
          value={filters.user?.value ?? 'all'}
          options={[
            { id: 'all', label: 'All' },
            { id: 'starred', label: 'Starred' },
          ]}
          onChange={value =>
            updateFilters({
              user:
                value === 'starred'
                  ? EntityUserFilter.starred(Array.from(starredEntities))
                  : EntityUserFilter.all(),
            })
          }
        />
      </div>
      <EETagPicker />
    </Flex>
  );
}

/** Port of the prototype EE template chooser, retaining catalog filter state. */
export function CreateContent({
  onTemplateStart,
  useMockTemplates = false,
}: {
  onTemplateStart?: (template: TemplateEntityV1beta3) => void;
  useMockTemplates?: boolean;
}): ReactElement {
  const classes = useTemplateTableStyles();
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('all');
  const [page, setPage] = useState(0);
  const [selectedTemplateTitle, setSelectedTemplateTitle] = useState<
    string | undefined
  >();
  const templateTags = useMemo(
    () =>
      Array.from(
        new Set(
          mockExecutionEnvironmentTemplates.flatMap(
            template => template.metadata.tags ?? [],
          ),
        ),
      ).sort(),
    [],
  );
  const filteredTemplates = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return mockExecutionEnvironmentTemplates.filter(template => {
      const matchesSearch = normalizedSearch
        ? `${template.metadata.title} ${template.metadata.description}`
            .toLowerCase()
            .includes(normalizedSearch)
        : true;
      const matchesTag = tag === 'all' || template.metadata.tags?.includes(tag);
      return matchesSearch && matchesTag;
    });
  }, [search, tag]);
  const rowsPerPage = 5;
  const visibleTemplates = filteredTemplates.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  useEffect(() => {
    setPage(0);
  }, [search, tag]);

  const handleTemplateSelect = (template: TemplateEntityV1beta3) => {
    setSelectedTemplateTitle(template.metadata.title);
    onTemplateStart?.(template);
  };

  return (
    <div data-testid="create-content">
      {useMockTemplates ? (
        <>
          <Flex direction="row" gap="3" style={{ marginBottom: 16 }}>
            <SearchField
              label="Search templates"
              value={search}
              onChange={setSearch}
            />
            <Select
              label="Filter by tag"
              value={tag}
              options={[
                { id: 'all', label: 'All tags' },
                ...templateTags.map(templateTag => ({
                  id: templateTag,
                  label: templateTag,
                })),
              ]}
              onChange={setTag}
            />
          </Flex>
          <TableContainer component={Paper} style={{ maxHeight: 460 }}>
            <Table stickyHeader aria-label="Execution environment templates">
              <TableHead>
                <TableRow>
                  <TableCell>Template</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Tags</TableCell>
                  <TableCell>Owner</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleTemplates.length ? (
                  visibleTemplates.map((template, index) => {
                    const selected =
                      selectedTemplateTitle === template.metadata.title;
                    return (
                      <TableRow
                        key={`${template.metadata.title}-${index}`}
                        className={`${classes.row} ${
                          selected ? classes.selectedRow : ''
                        }`}
                        hover
                        role="button"
                        tabIndex={0}
                        onClick={() => handleTemplateSelect(template)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleTemplateSelect(template);
                          }
                        }}
                      >
                        <TableCell>{template.metadata.title}</TableCell>
                        <TableCell>{template.metadata.description}</TableCell>
                        <TableCell>
                          {template.metadata.tags?.join(', ') || '—'}
                        </TableCell>
                        <TableCell>{template.spec?.owner || '—'}</TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4}>No templates found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filteredTemplates.length}
            page={page}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[rowsPerPage]}
            onPageChange={(_, nextPage) => setPage(nextPage)}
          />
        </>
      ) : (
        <EntityListProvider>
          <ExecutionEnvironmentTypeFilter />
          <Box p="4">
            <Grid.Root columns={{ initial: '1', lg: '12' }} gap="4">
              <Grid.Item colSpan={{ initial: '1', lg: '3' }}>
                <TemplateFilters />
              </Grid.Item>
              <Grid.Item colSpan={{ initial: '1', lg: '9' }}>
                <div data-testid="templates-container">
                  <TemplateGroups
                    groups={[
                      {
                        filter: (entity: TemplateEntityV1beta3) =>
                          entity.spec?.type?.includes(
                            'execution-environment',
                          ) ?? false,
                      },
                    ]}
                    TemplateCardComponent={({ template }) => {
                      const onStart = onTemplateStart
                        ? () => onTemplateStart(template)
                        : undefined;
                      return (
                        <WizardCard template={template} onStart={onStart} />
                      );
                    }}
                  />
                </div>
              </Grid.Item>
            </Grid.Root>
          </Box>
        </EntityListProvider>
      )}
    </div>
  );
}
