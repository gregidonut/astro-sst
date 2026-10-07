declare module "virtual:astro-sst:config" {
  import type { ResponseMode } from "./lib/build-meta.js";

  export const responseMode: ResponseMode;
}
