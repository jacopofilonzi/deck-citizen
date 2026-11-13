/**
 * True in development builds (`npm run build` / `npm run watch`), false in the packaged
 * release (`npm run pack`). Replaced at build time, so release code paths drop out.
 */
declare const __DEV__: boolean;
