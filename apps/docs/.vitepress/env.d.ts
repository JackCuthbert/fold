// The theme entry does `import './fold.css'` for its side effect, which is
// a bundler convention TypeScript knows nothing about. vite/client declares
// this, but vite is only a transitive dependency here (vitepress bundles
// it), so declaring the one module we actually use beats taking on a
// dependency this package does not own — see CLAUDE.md on inheriting types
// by luck. *(added 2026-08-17.)*
declare module '*.css' {
  const content: string
  export default content
}
