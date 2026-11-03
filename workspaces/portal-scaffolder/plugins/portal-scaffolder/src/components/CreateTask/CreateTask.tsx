import { useEffect, useState, useMemo, type ReactElement } from 'react';
import {
  Header,
  Page,
  Content,
  MarkdownContent,
} from '@backstage/core-components';
import { StepForm } from './StepForm';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  scaffolderApiRef,
  type FieldExtensionOptions,
} from '@backstage/plugin-scaffolder-react';
import type {
  TemplateEntityV1beta3,
  TemplateParameterSchema,
} from '@backstage/plugin-scaffolder-common';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Grid,
  IconButton,
  makeStyles,
  Step,
  StepContent,
  StepLabel,
  Stepper,
} from '@material-ui/core';
import ArrowBack from '@material-ui/icons/ArrowBack';
import { rootRouteRef } from '../../routes';

const headerStyles = makeStyles(theme => ({
  header_title_color: {
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
  },
  header_subtitle: {
    display: 'inline-block',
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
    opacity: 0.8,
    maxWidth: '75ch',
    marginTop: '8px',
    fontWeight: 500,
    lineHeight: 1.57,
  },
  headerTitleContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  backButtonContainer: {
    marginBottom: theme.spacing(1),
    marginLeft: theme.spacing(-1),
    [theme.breakpoints.up('sm')]: {
      marginLeft: theme.spacing(-1.5),
    },
  },
  backButton: {
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
    '&:hover': {
      backgroundColor: 'rgba(0, 0, 0, 0.04)',
    },
  },
}));

export const CreateTask = ({
  nativeFields,
  fromEE = false,
  embedded = false,
  templatePicker,
}: {
  nativeFields?: FieldExtensionOptions<any, any>[];
  fromEE?: boolean;
  embedded?: boolean;
  templatePicker?: (
    onSelect: (template: TemplateEntityV1beta3) => void,
  ) => ReactElement;
} = {}) => {
  const classes = headerStyles();
  const { namespace, templateName } = useParams<{
    namespace: string;
    templateName: string;
  }>();
  const scaffolderApi = useApi(scaffolderApiRef);
  const catalogApi = useApi(catalogApiRef);
  const rootLink = useRouteRef(rootRouteRef);
  const location = useLocation();
  const isEEFlow =
    fromEE || new URLSearchParams(location.search).get('from') === 'ee';
  const [selectedTemplate, setSelectedTemplate] = useState<{
    namespace: string;
    templateName: string;
  } | null>(() =>
    namespace && templateName ? { namespace, templateName } : null,
  );
  const resolvedNamespace = selectedTemplate?.namespace ?? namespace;
  const resolvedTemplateName = selectedTemplate?.templateName ?? templateName;

  const [entityTemplate, setEntityTemplate] =
    useState<TemplateParameterSchema | null>(null);
  const [templateEntity, setTemplateEntity] = useState<{
    spec?: { type?: string };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const initialFormData = useMemo(() => {
    const state = location.state as {
      initialFormData?: Record<string, any>;
    } | null;
    return state?.initialFormData;
  }, [location.state]);

  const finalSubmit = async (
    formData: Record<string, any>,
    secrets?: Record<string, string>,
  ) => {
    if (!resolvedNamespace || !resolvedTemplateName) {
      throw new Error('Missing namespace or name in URL parameters');
    }

    try {
      const task = await scaffolderApi.scaffold({
        templateRef: `template:${resolvedNamespace}/${resolvedTemplateName}`,
        values: formData,
        secrets,
      });

      // Redirect to the task details page
      navigate(
        `${rootLink()}/create/tasks/${task.taskId}${
          nativeFields ? location.search : ''
        }`,
      );
    } catch (err) {
      console.error('Error during final submit:', err); // eslint-disable-line no-console
    }
  };

  useEffect(() => {
    const fetchEntity = async () => {
      setLoading(true);
      try {
        if (!resolvedTemplateName || !resolvedNamespace) {
          setLoading(false);
          return;
        }
        const templateRef = `template:${resolvedNamespace}/${resolvedTemplateName}`;
        const response = await scaffolderApi.getTemplateParameterSchema(
          templateRef,
        );
        setEntityTemplate(response as TemplateParameterSchema);

        try {
          const entityRef = `template:${resolvedNamespace}/${resolvedTemplateName}`;
          const entity = await catalogApi.getEntityByRef(entityRef);
          if (entity) {
            setTemplateEntity(entity);
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.debug('Optional catalog entity lookup failed:', e);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch entity:', err);
        setError('Failed to fetch entity');
      } finally {
        setLoading(false);
      }
    };

    void fetchEntity();
  }, [resolvedTemplateName, resolvedNamespace, scaffolderApi, catalogApi]);

  const handleTemplateSelect = (template: TemplateEntityV1beta3) => {
    setEntityTemplate(null);
    setTemplateEntity(null);
    setError(null);
    setLoading(true);
    setSelectedTemplate({
      namespace: template.metadata.namespace ?? 'default',
      templateName: template.metadata.name,
    });
  };

  const handleBackToTemplateSelection = () => {
    setSelectedTemplate(null);
    setEntityTemplate(null);
    setTemplateEntity(null);
    setError(null);
    setLoading(false);
  };

  if (loading && !(isEEFlow && templatePicker && !resolvedTemplateName)) {
    return (
      <Page themeId="tool">
        <Header title="Loading..." />
        <Content>
          <p>Loading entity...</p>
        </Content>
      </Page>
    );
  }

  if (error) {
    return (
      <Page themeId="tool">
        <Header title="Error" />
        <Content>
          <p>{error}</p>
        </Content>
      </Page>
    );
  }

  if (
    !entityTemplate &&
    !(isEEFlow && templatePicker && !resolvedTemplateName)
  ) {
    return (
      <Page themeId="tool">
        <Header title="No Data" />
        <Content>
          <p>No entity data available.</p>
        </Content>
      </Page>
    );
  }

  const [description, templateInfo] = entityTemplate?.description
    ? entityTemplate.description.split('(Template Info)')
    : [];

  const handleBack = () => {
    const isExecutionEnvironment =
      templateEntity?.spec?.type?.includes('execution-environment') ?? false;

    if (isEEFlow) {
      navigate('/content/ee/create');
    } else if (isExecutionEnvironment) {
      navigate(`${rootLink()}/ee/create`);
    } else {
      navigate(`${rootLink()}`);
    }
  };

  const taskContent = (
    <Content>
      <Grid container direction="row-reverse">
        {templateInfo && (
          <Grid item xs={12} sm={12} md={5} lg={5}>
            <Card>
              <CardHeader title="About Template" />
              <CardContent>
                <MarkdownContent content={templateInfo} />
              </CardContent>
            </Card>
          </Grid>
        )}
        <Grid
          item
          xs={12}
          sm={12}
          md={templateInfo ? 7 : 12}
          lg={templateInfo ? 7 : 12}
        >
          <StepForm
            steps={entityTemplate?.steps ?? []}
            submitFunction={finalSubmit}
            initialFormData={initialFormData}
            storageKey={`${resolvedNamespace}/${resolvedTemplateName}`}
            nativeFields={nativeFields}
            leadingStepTitle={isEEFlow ? 'Choose template' : undefined}
            leadingStepContent={
              isEEFlow && templatePicker && !resolvedTemplateName
                ? templatePicker(handleTemplateSelect)
                : undefined
            }
            leadingStepNextDisabled={!selectedTemplate || loading}
            onBackToLeadingStep={
              isEEFlow && templatePicker
                ? handleBackToTemplateSelection
                : undefined
            }
            placeholderStepTitles={
              isEEFlow && !resolvedTemplateName
                ? ['Execution environment details', 'Ansible content']
                : undefined
            }
          />
          <Box
            display="flex"
            justifyContent="flex-end"
            marginTop="16px"
            marginBottom={4}
          >
            <Button
              onClick={() => {
                const isExecutionEnvironment =
                  templateEntity?.spec?.type?.includes(
                    'execution-environment',
                  ) ?? false;

                if (isEEFlow) {
                  navigate('/content/ee/images');
                } else if (isExecutionEnvironment) {
                  navigate(`${rootLink()}/ee/create`);
                } else {
                  navigate(`${rootLink()}`);
                }
              }}
              variant="text"
              color="primary"
            >
              Cancel
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Content>
  );

  if (embedded) return taskContent;

  return (
    <Page themeId="website">
      <Header
        pageTitleOverride={
          isEEFlow ? 'Create execution environment' : 'Create Task'
        }
        title={
          isEEFlow ? (
            'Create execution environment'
          ) : (
            <Box className={classes.headerTitleContainer}>
              <Box className={classes.backButtonContainer}>
                <IconButton
                  onClick={handleBack}
                  className={classes.backButton}
                  aria-label="go back"
                  data-testid="back-button"
                >
                  <ArrowBack />
                </IconButton>
              </Box>
              <span
                className={classes.header_title_color}
                data-testid="template-task--title"
              >
                {entityTemplate?.title ?? 'Create task'}
              </span>
            </Box>
          )
        }
        subtitle={
          <span className={classes.header_subtitle}>
            {isEEFlow
              ? 'Create an execution environment using a template.'
              : description}
          </span>
        }
        style={{ background: 'inherit', paddingTop: 0 }}
      />
      {taskContent}
    </Page>
  );
};
