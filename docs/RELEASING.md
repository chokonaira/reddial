# Releasing RedDial

RedDial publishes from GitHub Actions with npm trusted publishing and provenance. Do not store a long-lived npm token in repository secrets.

## One-Time npm Setup

In the npm package settings for `reddial`, add a trusted publisher with:

- **Provider:** GitHub Actions
- **Organization or user:** `chokonaira`
- **Repository:** `reddial`
- **Workflow:** `release.yml`
- **Environment:** `npm`

The workflow path is `.github/workflows/release.yml`. The environment value must match the `environment: npm` declaration in that workflow.

## Release Process

1. Update `package.json`, `package-lock.json`, and `CHANGELOG.md` in a pull request.
2. Run the complete validation suite documented in [`CONTRIBUTING.md`](../CONTRIBUTING.md).
3. Merge the pull request to `main` after required checks pass.
4. Create and publish a GitHub release whose tag is exactly `v<package version>`, for example `v0.1.2`.
5. The `Publish To npm` workflow checks the tag against `package.json`, tests the packed artifact, and runs `npm publish --provenance --access public`.
6. Verify the version and provenance badge on [npm](https://www.npmjs.com/package/reddial).

### Quick commands

```sh
npm version patch            # bumps package.json + commits + creates the vX.Y.Z tag
git push --follow-tags
gh release create "v$(node -p "require('./package.json').version")" --generate-notes
```

The release event triggers `Publish To npm`, which verifies the tag matches `package.json`, skips the publish if that version is already on the registry, and otherwise runs `npm publish`.

### Why direct publishing is disabled

Running `npm publish` by hand bypasses this flow and lets the npm version drift ahead of the GitHub releases. A `prepublishOnly` guard blocks `npm publish` unless `CI` is set, so the workflow is the only path that publishes. Every npm version therefore has a matching `vX.Y.Z` tag and release.

GitHub releases and npm versions are immutable project history. If a published package is wrong, fix it in a new patch release rather than attempting to replace the existing version.
