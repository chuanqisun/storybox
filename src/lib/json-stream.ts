import { JSONParser, type ParsedElementInfo } from "@streamparser/json";
import type { ChatCompletionChunk } from "openai/resources/index.mjs";
import type { Stream } from "openai/streaming.mjs";
import { filter, from, map, Observable, tap } from "rxjs";

export function parseJsonStream(stream: Stream<ChatCompletionChunk>) {
  const parser = new JSONParser();

  const input$ = from(stream).pipe(
    map((chunk) => chunk.choices[0]?.delta?.content),
    filter(Boolean),
    tap((chunk) => parser.write(chunk)),
  );

  return new Observable<ParsedElementInfo.ParsedElementInfo>((subscriber) => {
    parser.onValue = (value) => {
      subscriber.next(value);
    };
    parser.onEnd = () => {
      subscriber.complete();
    };

    input$.subscribe();
  });
}
