import { defineConfig } from 'vitepress'

// The user guide site — docs/specs/documentation.md.
//
// This package is the source of truth for user documentation; `docs/user/`
// was moved here on 2026-08-17. `docs/specs/` and `docs/architecture/` stay
// in the repo, deliberately: they are written for whoever is changing Fold,
// not for whoever is using it, and publishing them would put two audiences
// on one site.
export default defineConfig({
  title: 'Fold',
  description: 'A calm todo client for your own CalDAV server.',

  // GitHub Pages project page: jackcuthbert.github.io/fold/. The one line
  // to change for a custom domain — set it to '/' and add a CNAME.
  base: '/fold/',

  srcDir: 'guide',
  cleanUrls: true,
  lastUpdated: true,

  // A broken cross-link should fail the build, not ship. The guide files
  // link to each other by relative path and get moved around; this is what
  // notices when one stops resolving — it caught two on the first build.
  //
  // The one exemption is localhost: the local-CalDAV-server page points at
  // a Radicale running on the reader's own machine, which is unreachable
  // from a build by definition rather than dead.
  ignoreDeadLinks: [/^https?:\/\/localhost/],

  // These hrefs carry the base explicitly: head links are emitted verbatim,
  // so a bare '/favicon-32.png' would 404 under the /fold/ project page.
  // The SVG goes first so browsers that support it skip the PNG entirely.
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/fold/fold-mark.svg' }],
    ['link', { rel: 'icon', type: 'image/png', href: '/fold/favicon-32.png' }],
    ['meta', { name: 'theme-color', content: '#7a5c3e' }],

    // Lora and Cabin, the app's reading and chrome faces (theme/fold.css).
    // Two preconnects, not one: the stylesheet comes from googleapis.com
    // but the font files it references come from gstatic.com, so warming
    // only the first still leaves a cold connection on the critical path.
    // gstatic is crossorigin because fonts are fetched in CORS mode.
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    [
      'link',
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    ],
    // Both families in one request rather than two links, which would cost
    // a second round trip for the same bytes.
    //
    // Both go to 700 rather than the 600 the app's tokens stop at, because
    // the hero title is set in 700: a range ending at 600 leaves the
    // browser to synthesise a fake bold by smearing the 600, which reads as
    // soft rather than heavy. The app's own @font-face covers 400 700 for
    // both families for the same reason.
    //
    // Lora carries an italic axis because running prose uses emphasis;
    // Cabin does not, since headings and chrome never render italic and an
    // unused face is a fetch nobody needs. `display=swap` matches the app:
    // text paints in the fallback rather than waiting on the network.
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Cabin:wght@400..700&family=Lora:ital,wght@0,400..700;1,400..700&display=swap',
      },
    ],
  ],

  themeConfig: {
    logo: '/fold-mark.svg',
    siteTitle: 'Fold',

    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'GitHub', link: 'https://github.com/JackCuthbert/fold' },
    ],

    // Ordered the way someone meets the app: get in, put a todo in it,
    // organise, then the things you go looking for later.
    sidebar: [
      {
        text: 'Start here',
        items: [
          { text: 'Installing Fold', link: '/installing' },
          { text: 'Getting started', link: '/getting-started' },
          { text: 'Adding a todo', link: '/adding-todos' },
          { text: 'Todos', link: '/todos' },
        ],
      },
      {
        text: 'Organising',
        items: [
          { text: 'Lists', link: '/lists' },
          { text: 'Recognised lists', link: '/list-kinds' },
          { text: 'Colours and ordering', link: '/colours-and-ordering' },
          { text: 'Hiding lists', link: '/list-filter' },
        ],
      },
      {
        text: 'Getting around',
        items: [
          { text: 'Finding a todo', link: '/search' },
          { text: 'Keyboard shortcuts', link: '/keyboard-shortcuts' },
        ],
      },
      {
        text: 'Making it yours',
        items: [
          { text: 'Appearance', link: '/appearance' },
          { text: 'Completion sound', link: '/sound' },
          { text: 'Install on your phone', link: '/install-on-your-phone' },
          { text: 'Working offline', link: '/offline' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/JackCuthbert/fold' },
    ],

    editLink: {
      pattern:
        'https://github.com/JackCuthbert/fold/edit/main/apps/docs/guide/:path',
      text: 'Edit this page on GitHub',
    },

    search: { provider: 'local' },

    footer: {
      message:
        'Fold is <a href="https://github.com/JackCuthbert/fold">open source</a>.',
      copyright: 'Your todos live on your own CalDAV server.',
    },
  },
})
