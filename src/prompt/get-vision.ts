import { BehaviorSubject, distinctUntilChanged, fromEvent, mergeMap, Observable, scan, switchMap, tap } from "rxjs";
import type { CameraNode } from "../lib/ai-bar/lib/elements/camera-node";
import type { LlmNode } from "../lib/ai-bar/lib/elements/llm-node";
import { TogetherAINode } from "../lib/ai-bar/lib/elements/together-ai-node";
import { system } from "../lib/ai-bar/lib/message";
import { $ } from "../lib/dom";

export function getVision() {
  const pendingDescriptionCount$ = new BehaviorSubject(0);
  const cameraNode = $<CameraNode>("camera-node")!;
  const debugCapture = $<HTMLImageElement>("#debug-capture")!;
  const debugCaption = $<HTMLElement>("#debug-caption")!;
  const debugOutput = $<HTMLImageElement>("#debug-output")!;

  const vision$ = fromEvent(cameraNode, "framechange").pipe(
    // debounceTime(1000), // TODO remove
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
        pendingDescriptionCount$.next(pendingDescriptionCount$.value + 1);
        const response = aoai.chat.completions
          .create(
            {
              messages: [
                system`Describe the objects on the desk and their relationships in one brief sentence.`,
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
            console.log("latest summary", description);

            subscriber.next({
              startedAt,
              description,
            });
          })
          .catch()
          .finally(() => {
            pendingDescriptionCount$.next(pendingDescriptionCount$.value - 1);
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
    tap((state) => {
      debugCaption.textContent = state.description;
    }),
    switchMap(async (state) => {
      const togetherAINode = $<TogetherAINode>("together-ai-node")!;
      const dataUrl = await togetherAINode.generateImageDataURL(state.description);
      debugOutput.src = dataUrl;
    }),
  );

  const renderCaptionStatus$ = pendingDescriptionCount$.pipe(
    tap((count) => {
      const captionStatus = $<HTMLElement>("#caption-status")!;
      if (!count) {
        captionStatus.textContent = "Ready";
      } else {
        captionStatus.textContent = `Pending: ${count}`;
      }
    }),
  );

  return {
    vision$,
    renderCaptionStatus$,
  };
}
