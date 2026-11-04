import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { UseInControllerDialog } from './UseInControllerDialog';

beforeAll(() => {
  // React Aria escapes the CSP nonce meta selector; jsdom lacks CSS.escape.
  // Match the browser API shim already used by the other EE component tests.
  const cssApi = globalThis.CSS ?? ({} as typeof CSS);
  cssApi.escape ??= value => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: cssApi,
  });
});

it('prefills image details and reports the unavailable template honestly', async () => {
  const scaffold = jest.fn().mockRejectedValue(new Error('template not found'));
  render(
    <TestApiProvider apis={[[scaffolderApiRef, { scaffold }]]}>
      <UseInControllerDialog
        open
        imageName="team/ee"
        pullReference="registry/team/ee@sha256:one"
        onClose={jest.fn()}
      />
    </TestApiProvider>,
  );

  expect(
    screen.getByRole('textbox', { name: 'Execution environment name' }),
  ).toHaveProperty('value', 'team/ee');
  expect(screen.getByRole('textbox', { name: 'Description' })).toHaveProperty(
    'value',
    'Use team/ee in Ansible Automation Controller.',
  );
  expect(screen.getByRole('textbox', { name: 'Organization' })).toBeTruthy();
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in Controller' }),
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    'This action is not available yet. The task template was not found.',
  );
  expect(scaffold).toHaveBeenCalledWith({
    templateRef: 'template:default/ee-use-in-controller',
    values: {
      environmentName: 'team/ee',
      environmentDescription: 'Use team/ee in Ansible Automation Controller.',
      image: 'registry/team/ee@sha256:one',
      pull: 'always',
      organization: '',
    },
  });
});
