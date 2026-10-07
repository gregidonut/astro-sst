import type { ResponseStream } from "./lib/types.js";

type StreamHandler<TEvent> = (
  event: TEvent,
  responseStream: ResponseStream,
  context?: unknown,
  callback?: unknown,
) => void | Promise<void>;

declare global {
  const awslambda: {
    streamifyResponse<TEvent>(
      handler: StreamHandler<TEvent>,
    ): StreamHandler<TEvent>;
    HttpResponseStream: {
      from(
        underlyingStream: ResponseStream,
        metadata: {
          statusCode: number;
          headers?: Record<string, string>;
        },
      ): ResponseStream;
    };
  };
}

export {};
