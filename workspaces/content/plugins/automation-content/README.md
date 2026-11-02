# automation-content

The automation-content plugin is the discovery frontend for Ansible content
sourced from configured OCI registries. It catalogs execution environments and
collections as they exist in the registries, with per-image content
enumeration, item documentation, and registry health visibility.

## Pages

All routes live under `/content`:

| Route                                   | Page                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| `/content`                              | Redirect to the images catalog                                 |
| `/content/ee`                           | Images catalog with Images, Definition files, and Create tabs  |
| `/content/ee/:ref`                      | EE details: tags, contents, provided collections and plugins   |
| `/content/collections`                  | Collections catalog grouped by FQCN with latest-version badges |
| `/content/collections/:namespace/:name` | Collection details: versions, providing environments, contents |

The old `/automation-content` root and catalog paths redirect to their
`/content` equivalents, including execution environment and collection details.
There is no separate landing page. Registry sync lives in a superuser-only
header button on the images page.

The same components render in both the new frontend system (`alpha.tsx`
blueprints, the default host) and the legacy app entry, so both hosts serve
identical URLs.

## Requirements

The frontend is a discovery surface only — it holds no credentials and talks
exclusively to the portal backend through `automationContentApiRef`:

- `@ansible/plugin-automation-content-backend` — serves the content API the
  pages read (inventory, enumeration, item docs, registry health, sync).
- `@ansible/plugin-catalog-backend-module-automation-content` — ingests
  registry content into the catalog; the pages use catalog entities only for
  favorites/stars.

The Definition files and Create tabs reuse the Portal SDK's EE authoring
components. SCM token handling remains in `@ansible/portal-scaffolder`.

## Configuration

Registries are configured through the catalog provider (see
`catalog-backend-module-automation-content`):

```yaml
catalog:
  providers:
    automationContent:
      registries:
        - name: my-registry
          url: https://registry.example.com
          repositories: [ansible/network-ee, ansible/creator-ee]
          auth: { type: anonymous }
```

The backend plugin's README documents authentication options (anonymous,
username/password, TLS verification) for registry connections.

## Behavior notes

- **Images catalog scope:** the Images tab shows the registry image inventory,
  including images not classified as execution environments. Classification
  requires builder labels or manifest referrers that not every legitimate EE
  carries.
- **Inventory fidelity:** images whose contents could not be enumerated show a
  distinct "Contents unknown" badge; counts are never presented as complete
  when the inventory is partial.
- **View gating:** `ansible.content.view` gates the content views and API reads.
- **Sync gating:** the images page's header sync button is rendered only for
  superusers, and the backend rejects sync requests from non-superusers with 403.

## Local development

Run `yarn start` from the repository root and open
[/content/ee](http://localhost:3000/content/ee). For a
self-contained registry, `scripts/dev-up.sh --registry` (repository root)
starts a local OCI registry seeded with demo images and writes the matching
`app-config.local.yaml`.

For sign-in without external identity providers, enable the guest provider in
`app-config.local.yaml`:

```yaml
auth:
  providers:
    guest: {}
```
