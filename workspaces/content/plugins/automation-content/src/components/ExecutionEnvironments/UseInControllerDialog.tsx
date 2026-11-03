import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
  TextField,
} from '@backstage/ui';

/** Form for starting the reviewed EE-in-Controller scaffolder workflow. */
export function UseInControllerDialog({
  open,
  imageName,
  pullReference,
  onClose,
}: Readonly<{
  open: boolean;
  imageName: string;
  pullReference: string;
  onClose: () => void;
}>): ReactElement {
  const scaffolderApi = useApi(scaffolderApiRef);
  const [environmentName, setEnvironmentName] = useState('');
  const [description, setDescription] = useState('');
  const [organization, setOrganization] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setEnvironmentName(imageName);
      setDescription(`Use ${imageName} in Ansible Automation Controller.`);
      setOrganization('');
      setError('');
    }
  }, [imageName, open]);

  const handleSubmit = async (): Promise<void> => {
    if (!environmentName.trim()) {
      setError('Execution environment name is required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await scaffolderApi.scaffold({
        templateRef: 'template:default/ee-use-in-controller',
        values: {
          environmentName: environmentName.trim(),
          environmentDescription: description,
          image: pullReference,
          pull: 'always',
          organization: organization.trim(),
        },
      });
      onClose();
    } catch {
      setError(
        'This action is not available yet. The task template was not found.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={open}
      onOpenChange={value => !value && !submitting && onClose()}
    >
      <DialogHeader>Use in Controller</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="4">
          <Text color="secondary">
            Add this image as an execution environment in Ansible Automation
            Controller.
          </Text>
          {error && <Text role="alert">{error}</Text>}
          <TextField
            label="Execution environment name"
            value={environmentName}
            onChange={setEnvironmentName}
            isRequired
          />
          <TextField
            label="Description"
            value={description}
            onChange={setDescription}
          />
          <TextField
            label="Organization"
            value={organization}
            onChange={setOrganization}
          />
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={onClose} isDisabled={submitting}>
          Cancel
        </Button>
        <Button onPress={handleSubmit} isPending={submitting}>
          Use in Controller
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
