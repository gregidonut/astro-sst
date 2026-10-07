import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { test } from "bun:test";

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixture",
);

type BufferedResult = {
  statusCode?: number;
  headers?: Record<string, string | number | boolean>;
  body?: string;
};

function apiEvent(pathname: string) {
  return {
    version: "2.0",
    rawPath: pathname,
    rawQueryString: "",
    headers: { host: "example.com" },
    requestContext: {
      http: {
        method: "GET",
        path: pathname,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "astro-sst-test",
      },
    },
    isBase64Encoded: false,
  };
}

async function buildFixture(responseMode: "buffer" | "stream") {
  const outDir = path.join(fixtureDir, "dist", responseMode);
  await rm(outDir, { recursive: true, force: true });
  const built = Bun.spawn(["bunx", "astro", "build"], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      FIXTURE_RESPONSE_MODE: responseMode,
      FIXTURE_OUT_DIR: outDir,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(built.stdout).text(),
    new Response(built.stderr).text(),
    built.exited,
  ]);
  if (code !== 0) {
    throw new Error(`astro build failed\n${stdout}\n${stderr}`);
  }
  return {
    outDir,
    entry: path.join(outDir, "server", "entry.mjs"),
  };
}

test("buffer mode returns src/fetch.ts for an unmatched URL", async () => {
  const built = await buildFixture("buffer");
  try {
    const server = await import(built.entry);
    const response = (await server.handler(apiEvent("/api/unmatched"))) as BufferedResult;
    assert.equal(response.statusCode, 242);
    assert.equal(response.body, "from-fetch");
    assert.match(String(response.headers?.["content-type"]), /^text\/plain/);

    const page = (await server.handler(apiEvent("/"))) as BufferedResult;
    assert.equal(page.statusCode, 200);
    assert.match(page.body ?? "", /page-ok/);
  } finally {
    await rm(built.outDir, { recursive: true, force: true });
  }
}, 120_000);

test("stream mode selects the streaming Lambda handler", async () => {
  const seen: { statusCode?: number; headers?: Record<string, string> } = {};
  Object.assign(globalThis, {
    awslambda: {
      streamifyResponse<TEvent>(handler: TEvent) {
        return handler;
      },
      HttpResponseStream: {
        from(
          stream: PassThrough,
          metadata: { statusCode: number; headers?: Record<string, string> },
        ) {
          seen.statusCode = metadata.statusCode;
          seen.headers = metadata.headers;
          return stream;
        },
      },
    },
  });

  const built = await buildFixture("stream");
  try {
    const server = await import(built.entry);
    const stream = new PassThrough();
    const finished = new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });
    await server.handler(apiEvent("/api/unmatched"), stream);
    await finished;
    assert.equal(seen.statusCode, 242);
    assert.match(seen.headers?.["content-type"] ?? "", /^text\/plain/);

    const empty = new PassThrough();
    const emptyFinished = new Promise((resolve, reject) => {
      empty.on("finish", resolve);
      empty.on("error", reject);
    });
    await server.handler(apiEvent("/api/empty"), empty);
    await emptyFinished;
    assert.equal(seen.statusCode, 204);

    const redirect = new PassThrough();
    const redirectFinished = new Promise((resolve, reject) => {
      redirect.on("finish", resolve);
      redirect.on("error", reject);
    });
    await server.handler(apiEvent("/bounce"), redirect);
    await redirectFinished;
    assert.equal(seen.statusCode, 302);
    assert.equal(seen.headers?.["location"], "/landed");
  } finally {
    await rm(built.outDir, { recursive: true, force: true });
  }
}, 120_000);
