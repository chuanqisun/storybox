import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  filter,
  fromEvent,
  map,
  mergeMap,
  Observable,
  scan,
  share,
} from "rxjs";
import type { CameraNode } from "../lib/ai-bar/lib/elements/camera-node";
import type { LlmNode } from "../lib/ai-bar/lib/elements/llm-node";
import { system } from "../lib/ai-bar/lib/message";
import { $ } from "../lib/dom";

export function getVision() {
  const pendingDescriptionCountInternal$ = new BehaviorSubject(0);
  const cameraNode = $<CameraNode>("camera-node")!;
  const debugCapture = $<HTMLImageElement>("#debug-capture")!;

  const pendingDescriptionCount = pendingDescriptionCountInternal$.asObservable().pipe(share());

  const vision$ = fromEvent(cameraNode, "framechange").pipe(
    mergeMap(() => {
      return new Observable<{
        startedAt: number;
        description: string;
      }>((subscriber) => {
        const startedAt = Date.now();
        const frame = cameraNode.capture();
        debugCapture.src = frame;
        const llm = $<LlmNode>("llm-node")!;
        const aoai = llm.getClient("openai");
        const abortController = new AbortController();
        pendingDescriptionCountInternal$.next(pendingDescriptionCountInternal$.value + 1);

        aoai.chat.completions
          .create(
            {
              messages: [
                system`Precisely describe the objects in the scene and their relationships in one brief sentence. Do NOT mention desk surface, wall, or background.`,
                {
                  role: "user",
                  content: [
                    {
                      type: "image_url",
                      image_url: {
                        url: frame,
                      },
                    },
                  ],
                },
              ],
              model: "gpt-4o-mini",
            },
            {
              signal: abortController.signal,
            },
          )
          .then((response) => {
            const description = response.choices[0].message.content ?? "";
            subscriber.next({
              startedAt,
              description,
            });
          })
          .catch()
          .finally(() => {
            pendingDescriptionCountInternal$.next(pendingDescriptionCountInternal$.value - 1);
            subscriber.complete();
          });

        return () => {
          abortController.abort();
        };
      });
    }),
    scan(
      (acc, curr) => {
        const { startedAt, description } = curr;
        if (startedAt > acc.timestamp) {
          return {
            timestamp: startedAt,
            description,
          };
        } else {
          return acc;
        }
      },
      {
        timestamp: 0,
        description: "",
      },
    ),
    distinctUntilChanged((prev, curr) => prev.description === curr.description),
    share(),
  );

  // the lastest vision when pendingCount = 0
  const stableVision$ = combineLatest([vision$, pendingDescriptionCount]).pipe(
    filter(([, pendingCount]) => pendingCount === 0),
    map(([vision]) => vision),
    share(),
  );

  return {
    vision$,
    stableVision$,
    pendingDescriptionCount$: pendingDescriptionCountInternal$,
  };
}
