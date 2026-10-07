import { defineConfig } from "astro/config";
import aws from "astro-sst";

const responseMode =
  process.env.FIXTURE_RESPONSE_MODE === "stream" ? "stream" : "buffer";

export default defineConfig({
  output: "server",
  outDir: process.env.FIXTURE_OUT_DIR,
  adapter: aws({ responseMode }),
});
