import type { ResponseMode } from "./build-meta.js";

const VIRTUAL_ID = "virtual:astro-sst:config";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

export function responseModePlugin(responseMode: ResponseMode) {
  return {
    name: "astro-sst:config",
    resolveId: {
      filter: { id: new RegExp(`^${VIRTUAL_ID}$`) },
      handler() {
        return RESOLVED_VIRTUAL_ID;
      },
    },
    load: {
      filter: { id: new RegExp(`^\\0${VIRTUAL_ID}$`) },
      handler() {
        return {
          code: `export const responseMode = ${JSON.stringify(responseMode)};`,
        };
      },
    },
  };
}
