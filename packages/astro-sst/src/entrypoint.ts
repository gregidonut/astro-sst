import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type {
  APIGatewayProxyEventV2,
  CloudFrontRequestEvent,
} from "aws-lambda";
import { createApp } from "astro/app/entrypoint";
import { responseMode } from "virtual:astro-sst:config";
import {
  type InternalEvent,
  convertFrom,
  convertTo,
} from "./lib/event-mapper.js";
import { debug } from "./lib/logger.js";
import type { ResponseStream } from "./lib/types.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const streaming = responseMode === "stream";
const app = createApp({ streaming });

function createRequest(internalEvent: InternalEvent) {
  const requestProps = {
    method: internalEvent.method,
    headers: internalEvent.headers,
    body: ["GET", "HEAD"].includes(internalEvent.method)
      ? undefined
      : new Uint8Array(internalEvent.body),
  };
  return new Request(internalEvent.url, requestProps);
}

async function prerenderedErrorPageFetch(url: string): Promise<Response> {
  const { pathname } = new URL(url);
  const status = pathname.includes("/500") ? 500 : 404;
  const filename = status === 500 ? "500.html" : "404.html";
  try {
    const html = await fs.readFile(path.join(serverDir, filename), "utf-8");
    return new Response(html, {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return new Response(status === 500 ? "Internal Server Error" : "Not found", {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function render(internalEvent: InternalEvent) {
  return app.render(createRequest(internalEvent), {
    clientAddress:
      internalEvent.headers["x-forwarded-for"] || internalEvent.remoteAddress,
    prerenderedErrorPageFetch,
  });
}

async function streamHandler(
  event: APIGatewayProxyEventV2,
  responseStream: ResponseStream,
) {
  debug("event", event);
  try {
    const internalEvent = convertFrom(event);
    const response = await render(internalEvent);
    const convertedResponse = await convertTo({
      type: internalEvent.type,
      response,
      responseStream,
      cookies: Array.from(app.setCookieHeaders(response)),
    });
    debug("response", convertedResponse);
  } catch (error) {
    streamError(
      500,
      error instanceof Error ? error : new Error(String(error)),
      responseStream,
    );
  }
}

async function bufferHandler(
  event: APIGatewayProxyEventV2 | CloudFrontRequestEvent,
) {
  debug("event", event);
  const internalEvent = convertFrom(event);
  const response = await render(internalEvent);
  const convertedResponse = await convertTo({
    type: internalEvent.type,
    response,
    cookies: Array.from(app.setCookieHeaders(response)),
  });
  debug("response", convertedResponse);
  return convertedResponse;
}

export const handler = streaming
  ? awslambda.streamifyResponse(streamHandler)
  : bufferHandler;

export function streamError(
  statusCode: number,
  error: string | Error,
  responseStream: ResponseStream,
) {
  console.error(error);

  responseStream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode,
    headers: {
      "Content-Type": "text/html",
    },
  });

  responseStream.write(error.toString());
  responseStream.end();
}
