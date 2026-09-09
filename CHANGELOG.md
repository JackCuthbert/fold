# Changelog

## [1.5.0](https://github.com/JackCuthbert/fold/compare/v1.4.0...v1.5.0) (2026-09-09)


### Features

* **cli:** install bundled agent skills ([dedb9cc](https://github.com/JackCuthbert/fold/commit/dedb9cc7b239b4327067d224edcc33415b852868))
* **cli:** manage Fold todos from the command line ([3793f25](https://github.com/JackCuthbert/fold/commit/3793f250014cd40d5c1efa59e013488037150ffc))


### Bug Fixes

* **cli:** identify the npm package source ([fdab6b6](https://github.com/JackCuthbert/fold/commit/fdab6b6c1f4326797aa05e127e4bf3375d8724ca))
* **cli:** preserve whitespace in interactive passwords ([6ac3245](https://github.com/JackCuthbert/fold/commit/6ac32452d7b4e57a7d18c00311605ace6f08633f))
* **cli:** publish releases without an npm token ([804d0d6](https://github.com/JackCuthbert/fold/commit/804d0d68012f7cd3794665667080d4ed3bc4aa85))
* **cli:** recover login from corrupt saved sessions ([a6014c6](https://github.com/JackCuthbert/fold/commit/a6014c6818698b60471d304dd8eb83800ba08e56))


### Documentation

* **cli:** explain how to test the CLI before publishing ([14cbe65](https://github.com/JackCuthbert/fold/commit/14cbe6516bfe3e684ad6e8758b6ba24f0dbebbd7))
* **repo:** streamline agent guidance ([ff81d94](https://github.com/JackCuthbert/fold/commit/ff81d945a23ac04b70bf14278dd967b440d75bdd))

## [1.4.0](https://github.com/JackCuthbert/fold/compare/v1.3.0...v1.4.0) (2026-08-21)


### Features

* **client:** find any action by typing, with Ctrl+K ([32d411b](https://github.com/JackCuthbert/fold/commit/32d411b622b7bab05771ff4e895d51451e15931b))
* **client:** open the command palette from the sidebar ([de45a5d](https://github.com/JackCuthbert/fold/commit/de45a5df54a9bdff47e291325e7ef600409a4c89))
* **client:** reach new todo and commands without opening the nav ([842d7fe](https://github.com/JackCuthbert/fold/commit/842d7fed63a546432055c684df9d1a3d9d380985))
* **client:** rebalance the sidebar so every row reads alike ([4915414](https://github.com/JackCuthbert/fold/commit/4915414e0d241ce8c022e36b5f52242211a93bf2))


### Documentation

* explain the command palette in the user guide ([8b6cf5a](https://github.com/JackCuthbert/fold/commit/8b6cf5a82475c84cf340181bc6a6442350ce8776))
* specify the command palette ([31b0eb7](https://github.com/JackCuthbert/fold/commit/31b0eb7ed2096371dfe7c7d6b3f90620af103acb))

## [1.3.0](https://github.com/JackCuthbert/fold/compare/v1.2.0...v1.3.0) (2026-08-20)


### Features

* **client:** wrap long todos in quick add instead of hiding them ([1e10a90](https://github.com/JackCuthbert/fold/commit/1e10a9019f6e19021b427ea44e6d9bb18f6ba5f5))


### Bug Fixes

* **client:** read a due time that follows a due date in the same todo ([0c4df81](https://github.com/JackCuthbert/fold/commit/0c4df81a4f796f563e67c0ff06c2856bc66bdbc0))
* **client:** stop Summary growing a second scrollbar down the page ([3e05587](https://github.com/JackCuthbert/fold/commit/3e05587cbafc94bc84189825681f27372c2ce0a2))


### Documentation

* refresh the README screenshots for the new quick add ([6b8a2bf](https://github.com/JackCuthbert/fold/commit/6b8a2bf6ccc865917c5ff0050fb0e9cdf92ed8bf))

## [1.2.0](https://github.com/JackCuthbert/fold/compare/v1.1.0...v1.2.0) (2026-08-18)


### Features

* **docs:** set the user guide in the app's own typefaces ([db04f07](https://github.com/JackCuthbert/fold/commit/db04f07879863966baefe8b7d244d654378728c8))

## [1.1.0](https://github.com/JackCuthbert/fold/compare/v1.0.0...v1.1.0) (2026-08-17)


### Features

* **client:** schedule a todo for this Saturday or Sunday ([4730fe5](https://github.com/JackCuthbert/fold/commit/4730fe540ebdd25ccf96734eca67f9cf3aa3aba1))


### Bug Fixes

* **client:** keep "this week" in the todo instead of eating it ([7a0d62f](https://github.com/JackCuthbert/fold/commit/7a0d62fa884b3aff67780fab776201cdabc94e81))


### Documentation

* add Docker installation to the user guide ([2542931](https://github.com/JackCuthbert/fold/commit/2542931be858cf98335171d5c14dbf94f304aa8d))
* link the published user guide ([c087c3f](https://github.com/JackCuthbert/fold/commit/c087c3f3f69e867f03bbfd8687377246fa4820dc))

## 1.0.0 (2026-08-17)


### Features

* a calm todo client for your own CalDAV server ([97086ce](https://github.com/JackCuthbert/fold/commit/97086ce1a87b6ebfdf4b5c82acf5cf2e044d45b8))

## Changelog

Releases are cut by [release-please](https://github.com/googleapis/release-please)
from Conventional Commit messages, and this file is generated — do not edit
it by hand (see `docs/specs/releases.md`).

Fold's first public release is v1.0.0. Development before that happened in
a private repository whose history was squashed to a single commit, so the
0.x releases it describes no longer exist and are not documented here.
