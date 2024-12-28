import { concatMap, filter, Observable, Subject, Subscription } from "rxjs";
import type { AIBar, TextToSpeechProvider } from "../ai-bar";
import { CustomOutputBasic } from "./lib/custom-output-basic";

export function defineElevenLabsTtsNode(tagName = "eleven-labs-tts-node") {
  customElements.define(tagName, ElevenLabsTtsNode);
}

export const defaultIds = {
  femaleDefault: "cgSgspJ2msm6clMCkdW9",
  maleDefault: "iP95p4xoKVk53GoZ742B",
};

export interface SpeechOption {
  voice?: string;
  onStart?: () => void;
  onEnd?: () => void;
}

export class ElevenLabsTtsNode extends HTMLElement implements TextToSpeechProvider {
  private sentenceQueue = createQueue<SpeechOption>();
  // private audioSink = new CustomOutputStream();
  private audioSink = new CustomOutputBasic();
  private isStarted = false;
  private sub: Subscription | null = null;

  private finishCallbacks: Map<string, () => void> = new Map();

  connectedCallback() {
    this.setAttribute("provides", "tts");

    this.sub = this.sentenceQueue.queue$
      .pipe(
        filter((block) => !!block),
        concatMap(async ([text, options]) => {
          const response = await this.synthesizeSpeechInternal(text, { ...options, stream: true });

          // const { started, ended } = await this.playResponseStream(response);
          const { started, ended } = await this.playResponseBasic(response);

          started.then(() => {
            options?.onStart?.();
          });

          // don't await on ending, so we can continue with the next sentence
          ended.then(() => {
            options?.onEnd?.();
            if (this.finishCallbacks.has(text)) {
              this.finishCallbacks.get(text)?.();
              this.finishCallbacks.delete(text);
            }
          });
        }), // must be single threaded to ensure the clips are added in the original sequence
      )
      .subscribe();
  }

  disconnectedCallback() {
    this.sub?.unsubscribe();
  }

  startSpeaker(): void {
    this.audioSink.start();
    this.isStarted = true;
  }

  async synthesizeSpeech(
    text: string,
    options?: { voice?: string; stream?: boolean; modelId?: string },
  ): Promise<ArrayBuffer> {
    const response = await this.synthesizeSpeechInternal(text, options);
    const buffer = await response.arrayBuffer();
    return buffer;
  }

  private async synthesizeSpeechInternal(
    text: string,
    options?: { voice?: string; stream?: boolean; modelId?: string },
  ) {
    const connection = this.closest<AIBar>("ai-bar")?.getAzureConnection();
    if (!connection)
      throw new Error("Unable to get credentials from the closest <ai-bar>. Did you forget to provide them?");

    const requestInit = {
      method: "POST",
      headers: {
        "xi-api-key": connection.elevenLabsKey,
        "Content-Type": "application/json",
      },
      // body: JSON.stringify({ text: text, model_id: "eleven_multilingual_v2" }),
      body: JSON.stringify({
        text: text,
        model_id: options?.modelId ?? "eleven_turbo_v2_5",
        use_speaker_boost: true,
        stability: 1,
        similarity_boost: 1,
      }),
    };

    const chosenVoice = options?.voice ?? this.getAttribute("voice") ?? defaultIds.maleDefault;

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${chosenVoice}${options?.stream ? "/stream" : ""}`,
      requestInit,
    );

    if (!response.ok) {
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("Response body is empty");
    }

    return response;
  }

  async playResponseBasic(response: Response) {
    const uint8Array = new Uint8Array(await response.arrayBuffer());
    const isStarted = Promise.withResolvers<void>();
    const isEnded = Promise.withResolvers<void>();

    this.audioSink.appendBuffer(uint8Array, {
      onPlayStart: () => {
        isStarted.resolve();
      },
      onPlayEnd: () => {
        isEnded.resolve();
      },
    });

    return {
      started: isStarted.promise,
      ended: isEnded.promise,
    };
  }

  async playResponseStream(response: Response) {
    if (!response.body) throw new Error("Response body is empty");

    const progress = {
      total: 0,
      started: 0,
      ended: 0,
    };

    const isStarted = Promise.withResolvers<void>();
    const isEnded = Promise.withResolvers<void>();

    const checkProgress = () => {
      if (progress.started === 1) {
        isStarted.resolve();
      }

      if (progress.total === progress.ended) {
        isEnded.resolve();
      }
    };

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      progress.total++;

      this.audioSink.appendBuffer(value, {
        onPlayStart: () => {
          progress.started++;
          checkProgress();
        },
        onPlayEnd: () => {
          progress.ended++;
          checkProgress();
        },
      });
    }

    return {
      started: isStarted.promise,
      ended: isEnded.promise,
    };
  }

  async queue(text: string, options?: SpeechOption) {
    const deferred = Promise.withResolvers<void>();

    console.log(`[11-labs-tts:enqueue] ${text}`);
    if (!this.isStarted) {
      this.audioSink.start();
      this.isStarted = true;
    }

    this.finishCallbacks.set(text, deferred.resolve);
    this.sentenceQueue.enqueue(text, options ?? {});

    return deferred.promise;
  }

  clear(): void {
    this.audioSink.pause();
    this.isStarted = false;
    // this.audioSink.start();
  }
}

function createQueue<T = any>() {
  const items$ = new Subject<[string, T]>();

  function enqueue(text: string, data: T) {
    if (text.trim()) {
      items$.next([text, data]);
    }
  }

  return {
    queue$: items$ as Observable<[string, T]>,
    enqueue,
  };
}
