import { parseEEDefinition } from './eeDefinitionUtils';

it('parses the networking seed definition shape', () => {
  expect(
    parseEEDefinition(`
version: 3
images:
  base_image:
    name: zot/demo/utopia-ee@sha256:immutable
dependencies:
  galaxy:
    collections:
      - name: ansible.netcommon
      - name: ansible.utils
`),
  ).toMatchObject({
    baseImageName: 'zot/demo/utopia-ee@sha256:immutable',
    collections: [{ name: 'ansible.netcommon' }, { name: 'ansible.utils' }],
  });
});

it('preserves inline dependencies, interpreter path and collection coercion', () => {
  expect(
    parseEEDefinition(`
images:
  base_image:
    name: 42
dependencies:
  python_interpreter:
    python_path: ' /usr/bin/python3 '
  python: [' requests ', '', 42, false]
  system:
    packages: [' git ', '', 5]
  galaxy:
    collections:
      - name: ' ns.tools '
        version: 2
        type: 3
      - name: 99
      - ignored
`),
  ).toEqual({
    baseImageName: '42',
    pythonPath: '/usr/bin/python3',
    collections: [{ name: 'ns.tools', version: '2', type: '3' }],
    pythonPackages: ['requests'],
    pythonFileRef: null,
    systemPackages: ['git'],
    systemFileRef: null,
    collectionsFileRef: null,
  });
  expect(
    parseEEDefinition('dependencies:\n  system: [git, curl]')?.systemPackages,
  ).toEqual(['git', 'curl']);
});

it.each(['txt', 'in'])(
  'preserves python/system .%s file references',
  extension => {
    expect(
      parseEEDefinition(
        `dependencies:\n  python: requirements.${extension}\n  system: bindep.${extension}`,
      ),
    ).toMatchObject({
      pythonPackages: null,
      pythonFileRef: `requirements.${extension}`,
      systemPackages: null,
      systemFileRef: `bindep.${extension}`,
    });
  },
);

it.each(['yaml', 'yml'])('preserves galaxy .%s file references', extension => {
  expect(
    parseEEDefinition(`dependencies:\n  galaxy: requirements.${extension}`),
  ).toMatchObject({
    collections: [],
    collectionsFileRef: `requirements.${extension}`,
  });
});

it.each([
  undefined,
  '',
  '   ',
  '# comment',
  'null',
  'hello',
  '42',
  'true',
  '[]',
  '- item',
  'a: [',
  '!unknown value',
  'x'.repeat(100001),
])(
  'returns null without throwing for empty, malformed, non-record or oversized input (%#)',
  input => {
    expect(parseEEDefinition(input)).toBeNull();
  },
);

it('returns empty fields for unsupported record fields or dependency shapes', () => {
  expect(
    parseEEDefinition(
      'images: []\ndependencies:\n  python: {}\n  system: false\n  galaxy: 4',
    ),
  ).toEqual({
    baseImageName: null,
    pythonPath: null,
    collections: [],
    collectionsFileRef: null,
    pythonPackages: null,
    pythonFileRef: null,
    systemPackages: null,
    systemFileRef: null,
  });
});
