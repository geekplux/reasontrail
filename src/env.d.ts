/// <reference types="vite/client" />
// `LOCAL_VIEWER` is `true` only in the local viewer's build (vite.viewer.config.ts), so code the viewer never reaches
// (the AI client, the website's template fetch) drops out of its one-file bundle.
interface ImportMetaEnv {
  readonly LOCAL_VIEWER?: boolean;
}
