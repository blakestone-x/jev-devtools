# Packaging and releases

No npm release is configured. The root, playground, and library currently have `private: true`; npm therefore refuses publication. Tarball installation works without publishing.

From the repository root:

```sh
npm ci
npm run check
npm test
npm run build
npm run check:playground
npm run verify:package
npm run verify:nextjs
npm run pack:devtools
```

The archive appears in the repository root and includes only compiled library files, its README, license, notices, and package manifest. The playground, fixtures, tests, environment files, and original lab are excluded. Install this archive in another project or use the independent example.

Before the first registry release, make a release PR that:

1. Confirms an available npm name/scope and owner access. The current `@diagram-motion-lab/jev-devtools` name is preserved for compatibility, not a claim of registry ownership.
2. Updates imports, metadata, workspace dependency, example archive path, and documentation if the name changes.
3. Chooses a version and records changes; updates package/workspace references, lockfile, and example archive path together.
4. Removes `private` from the library only, explicitly configures public access for a scoped package, and leaves the root/playground private.
5. Runs the full verification suite and `npm pack --dry-run -w @diagram-motion-lab/jev-devtools`; inspects archive contents and notices.

After review and explicit authorization, publish the reviewed package and tag that release. CI never publishes automatically. Merge the extraction PR before merging the original repo cleanup PR. A registry release is not required for cleanup because the standalone repo supports packed installation.

References: [npm package metadata](https://docs.npmjs.com/cli/configuring-npm/package-json/), [GitHub Node CI](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs).
