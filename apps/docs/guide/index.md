---
layout: home

hero:
  # `name` is the big gradient word and `text` renders at the same 56px/700
  # beside it, so the description goes in `tagline` — the smaller muted
  # line — leaving Fold as the only thing at title size.
  name: Fold
  tagline: A calm todo client for your own CalDAV server
  # The SVG, not icon-192.png: the PNG is the PWA icon and carries an
  # opaque white square. The rounded tile behind it is drawn in CSS
  # (.VPHomeHero .image-src in the theme), so it follows the page's theme
  # rather than being baked into a bitmap.
  image:
    src: /fold-mark.svg
    alt: Fold
  actions:
    - theme: brand
      text: Install Fold
      link: /installing
    - theme: alt
      text: Get started
      link: /getting-started
    - theme: alt
      text: GitHub
      link: https://github.com/JackCuthbert/fold

features:
  - title: Natural language scheduling
    # Single-quoted: unquoted, YAML reads ` #chores p1"…` as a trailing
    # comment and silently truncates the string at "3pm".
    details: 'Type "Clean the gutters tomorrow at 3pm #chores p1" — date, list and priority all read as you type.'
    link: /adding-todos
    linkText: How it reads your line
  - title: Recognised lists
    details: Name a list Reading, Health or Shopping and it picks up behaviour to match, with no setting to find.
    link: /list-kinds
    linkText: What each one does
  - title: Works offline
    details: Changes are queued and sent when the connection comes back. Close the tab mid-flight and they still arrive.
    link: /offline
    linkText: Working offline
  - title: Keyboard first
    details: Add a todo or jump to any view without reaching for the mouse, from wherever you are.
    link: /keyboard-shortcuts
    linkText: Every shortcut
---
