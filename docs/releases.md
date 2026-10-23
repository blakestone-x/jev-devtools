# Packaging and releases

## Patch release 0.1.3

The 0.1.3 patch isolates the drawer from host-page CSS, improves diagram pan and zoom, and synchronizes README npm links with the package version. Host-page CSS overrides no longer reach the inspector inside its Shadow DOM; public component props and server APIs are unchanged. Follow the verification and explicit publishing approval process below. Use `jev-devtools-0.1.3.tgz` for this patch; the first-publish commands are historical.

## First published release

**[`jev-devtools@0.1.0`](https://www.npmjs.com/package/jev-devtools/v/0.1.0) was published on October 23, 2026 and is experimental.** At its publication, the `latest` tag pointed to `0.1.0`. Only `packages/jev-devtools` is publishable, with explicit public access and the npm registry configured. The workspace root, playground, and examples remain private. There is no automatic publishing workflow.

The registry also contains npm’s `0.0.0-stage` placeholder. It does not control default installs: `npm install jev-devtools` resolves the `latest` tag. See [release notes](../CHANGELOG.md) and [npm staged publishing](https://docs.npmjs.com/staged-publishing/).

## Prepare and inspect an archive

Use Node 22.12+ (24 recommended). From a clean checkout of the reviewed release commit:

```sh
npm ci
npm run check
npm test
npm run build
npm run check:playground
npm run verify:package
npm run verify:nextjs
git diff --check
npm pack --dry-run --json -w jev-devtools
npm run pack:devtools
tar -tzf jev-devtools-0.1.3.tgz
shasum -a 256 jev-devtools-0.1.3.tgz
```

The archive must contain only `package.json`, the package README, MIT license, third-party notices, the setup skill and its three Markdown references under `skills/setup-jev-devtools`, and compiled JavaScript, declaration files, and scoped CSS under `lib/src` and `lib/server`. It must not contain playground code, tests, fixtures, source TypeScript, demo media, environment files, or credentials. `verify:package` checks the actual pack file list before installing into an independent React app. `verify:nextjs` checks a separate packed installation with real development and production Next.js servers. Both use sample responses; neither makes live inference calls.

Inspect the packed manifest too:

```sh
tar -xOf jev-devtools-0.1.3.tgz package/package.json
```

Confirm the name/version, public access, Node engine, React peers, three public exports, and absence of `private: true`. Save the release commit SHA and archive checksum with the release evidence. Keep the archive unchanged between final inspection and publication. Do not publish from a dirty checkout or use a wildcard that could select an old archive.

## First-publish checklist (historical)

The first publish below is complete. These commands record that process; **do not republish 0.1.0**. For future versions, use the release workflow below with the new version and archive. Each merge, publish, and release tag still requires explicit authorization.

Before running a publish command:

1. Review and merge the release PR with Diego's explicit approval. Use its exact merged commit on `main`, with green CI, and run the archive checks above again if the contents changed.
2. Confirm which npm account will own the package. GitHub authentication does not authenticate npm. Sign in to that account locally and enable two-factor authentication; complete browser/security-key challenges yourself. Never paste tokens or recovery codes into chat or commit them.
3. Verify the registry identity and current name availability using the read-only commands below. A 404 means no public package was found; a different error is not proof of availability. If a package now exists, check ownership and stop rather than attempting an unauthorized publish.
4. Obtain explicit authorization to publish `jev-devtools@0.1.0` publicly with the `latest` tag. `latest` makes the documented `npm install jev-devtools` command resolve this release; the version remains experimental despite that tag.

Authentication and read-only checks (these do not publish):

```sh
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm view jev-devtools name version maintainers --json --registry=https://registry.npmjs.org/
```

After all approvals, from the repository root, publish the **inspected archive**:

```sh
npm publish ./jev-devtools-0.1.0.tgz --access public --tag latest --registry=https://registry.npmjs.org/
```

Complete npm's authentication challenge if prompted. This command is documented for the maintainer; it is not run by preparation scripts or CI. npm name/version pairs cannot be overwritten after publication. See [npm's unscoped publishing guide](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/) and [publish command](https://docs.npmjs.com/cli/v11/commands/npm-publish/).

## Confirm the published result

After npm reports success:

```sh
npm view jev-devtools@0.1.0 name version dist.integrity dist.tarball --json --registry=https://registry.npmjs.org/
npm view jev-devtools dist-tags --json --registry=https://registry.npmjs.org/
```

Confirm `latest` points to `0.1.0`. Install `jev-devtools@0.1.0` from the registry in a clean React consumer, verify the imports and CSS, and repeat the Next.js example using the registry version. Check the public README and license. Record the registry integrity alongside the local archive checksum.

Then, with release/tag authorization, tag the exact published commit and create a GitHub release using the 0.1.0 notes. Update the repository documentation and changelog date through a PR after publication is confirmed. Do not claim a release exists before npm confirms success.

## Future releases

Use a release PR for each version. Update the library version, the playground's exact workspace dependency, example archive paths, root lockfile, and changelog together. Run `npm run sync:readme-version` after setting the library version: it synchronizes both READMEs' static version badges, exact-version npm links, and archive examples from `packages/jev-devtools/package.json`. `npm run check` and the package's `prepack` hook reject mismatches. Exact-version links avoid relying on npm's default package-page version display; the badge deliberately describes the checked-out release rather than fetching a potentially newer `latest` tag. Run the full checks and inspect the packed artifact. After review and explicit approval, publish that artifact, verify the registry result, and tag the exact release commit. Never publish every push or every merge to `main`.

A later, separately reviewed automation PR can add [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) through GitHub Actions OIDC. Configure the exact repository and workflow on the npm package, use a protected release environment with maintainer approval and narrowly scoped `id-token: write`, and require an approved release commit/tag. Use a supported Node/npm version and GitHub-hosted runner, and verify provenance. This avoids storing a long-lived publish token in GitHub. No trusted publisher, npm token, publishing permission, automatic release, or release workflow is configured by this preparation PR.
