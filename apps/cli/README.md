# Fold CLI

Manage todos in a self-hosted [Fold](https://github.com/JackCuthbert/fold)
installation from a terminal or AI agent.

```sh
npm install --global @jackcuthbert/fold-cli
fold-cli auth login
fold-cli skill install --agent codex --scope user
fold-cli todo list
fold-cli todo create "Book dentist" --list Personal
```

Run `fold-cli --help` for the complete command list. Add `--json` to any data
command for machine-readable output.

Install the bundled `fold-todos` agent skill with `--agent codex`, `--agent
claude`, or `--agent all` and `--scope user` or `--scope project`. Omitting
`--agent` installs to the shared agent skills directory. Existing skill files
are not overwritten.

The CLI stores Fold's encrypted session cookie, not the plaintext CalDAV
password. Regular use renews the session; after seven inactive days, run
`fold-cli auth login` again.

## Migrating from the `fold` command

The executable is now `fold-cli` to avoid conflicting with the system's
`fold` text-wrapping command. After the release is published, replace the old
installation so its `fold` executable is removed:

```sh
npm uninstall --global @jackcuthbert/fold-cli
npm install --global @jackcuthbert/fold-cli@latest
fold-cli auth status
```

Use the package manager and installation scope used for your original install.
Replace `fold` with `fold-cli` in scripts, shell aliases, and agent instructions;
remove aliases or symlinks that make `fold` invoke the Fold CLI. Subcommands,
flags, environment variables, and saved session locations are unchanged, so
an unexpired session still works without signing in again.

Previously installed agent skills still invoke `fold`. Update their commands
or move the existing `SKILL.md` outside its skill directory as a backup, then reinstall
with `fold-cli skill install` using the same `--agent` and `--scope`. The
installer refuses to overwrite an existing file. Skill directories are
`.codex/skills/fold-todos`, `.claude/skills/fold-todos`, or
`.agents/skills/fold-todos`, under your home directory for user scope or the
project for project scope. Repeat for every installed agent and scope, and
restart the agent session to load the updated instructions.
