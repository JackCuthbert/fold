# Fold CLI

Manage todos in a self-hosted [Fold](https://github.com/JackCuthbert/fold)
installation from a terminal or AI agent.

```sh
npm install --global @jackcuthbert/fold-cli
fold auth login
fold todo list
fold todo create "Book dentist" --list Personal
```

Run `fold --help` for the complete command list. Add `--json` to any data
command for machine-readable output.

The CLI stores Fold's encrypted session cookie, not the plaintext CalDAV
password. Regular use renews the session; after seven inactive days, run
`fold auth login` again.
