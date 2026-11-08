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

npm does not check these values when you save them, and they are case sensitive. A new trusted publisher must complete its first successful publish within two days; after that it expires and can neither be used nor edited. So delete any older configuration for this package, create the new one right before the publish, and publish within two days.

Trusted publishing requires npm CLI 11.5.1 or newer. The release workflow uses Node 24, whose bundled npm is newer than that, and checks the version before publishing. It does not upgrade npm: npm 12 changed the output of `npm pack --json`, and a newer major may change more. The workflow reads no `NPM_TOKEN` secret; if one is still stored in the repository settings, delete it.

## Release Process

Every npm version must have a matching `vX.Y.Z` GitHub release. There are two equivalent paths; both keep them aligned.

### Path A: publish from CI (requires the one-time npm setup above)

```sh
npm version patch            # bumps package.json + commits + creates the vX.Y.Z tag
git push --follow-tags
gh release create "v$(node -p "require('./package.json').version")" --generate-notes
```

The release event triggers `Publish To npm`, which verifies the tag matches `package.json`, skips publishing if that version is already on the registry, and otherwise runs `npm publish --access public`. npm generates provenance automatically for trusted publishing.

#### If the automatic publish failed

Fix the cause first (usually the trusted publisher setup on npm), then run the same workflow by hand for the existing release. The run checks that the GitHub release exists and is neither a draft nor a prerelease, that its tag matches `package.json`, and that the version is not on npm yet, so repeating it is safe:

```sh
gh workflow run release.yml -r vX.Y.Z -f tag=vX.Y.Z
gh run list --workflow release.yml --limit 1
gh run watch <run id from the line above>
```

`-r vX.Y.Z` runs the workflow at the tag itself, so the provenance names the tagged commit and the workflow file is the tag's own. Tags made before this workflow had a manual trigger (v0.2.0 and older) cannot be run this way; publish those from a maintainer's machine (Path B).

Re-running the failed run from the Actions page is not the same thing: a re-run reuses the workflow file as it was for that run, so a fix to the workflow only takes effect through `gh workflow run` or a new release.

If the publish step fails with `404 Not Found - PUT https://registry.npmjs.org/reddial`, the OIDC token exchange failed and npm had no usable credential: check the five trusted publisher values and that the configuration has not expired. The publish step logs at verbose level, so the registry's message about the exchange is in the job log; no token is printed.

### Path B: publish from your machine

```sh
npm version patch            # bumps package.json + commits + creates the vX.Y.Z tag
git push --follow-tags
npm publish --access public
```

The `postpublish` hook (`scripts/sync-release.mjs`) then creates the matching GitHub release automatically. Always bump and commit *before* publishing so the tag points at the published code; if the working tree is behind, the hook prints the `gh release create` command to run instead of guessing.

Either way, finish by verifying the version on [npm](https://www.npmjs.com/package/reddial).

## How alignment is enforced

- The publish workflow refuses to publish unless the release tag equals `package.json` version, and skips versions already on the registry, so re-running or backfilling a release is safe.
- `postpublish` auto-creates the GitHub release after a manual `npm publish`, so a hand publish can no longer drift ahead of the releases.

GitHub releases and npm versions are immutable project history. If a published package is wrong, fix it in a new patch release rather than attempting to replace the existing version.
