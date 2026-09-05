# Testing the CLI locally

Build the same Node.js bundle that the npm package publishes:

```sh
bun run --filter @jackcuthbert/fold-cli build
```

Run that bundle directly with Node, without installing or publishing it:

```sh
node apps/cli/dist/index.js --help
node apps/cli/dist/index.js auth login
node apps/cli/dist/index.js todo list
```

Run these commands from the repository root. Rebuild after changing the CLI
source before testing the bundle again.
