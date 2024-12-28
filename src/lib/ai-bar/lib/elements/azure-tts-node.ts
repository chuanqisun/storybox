import { concatMap, filter, Observable, Subject, Subscription } from "rxjs";
import type { AIBar, TextToSpeechProvider } from "../ai-bar";
import { CustomOutputStream } from "./lib/custom-output-stream";

export function defineAzureTtsNode(tagName = "azure-tts-node") {
  customElements.define(tagName, AzureTtsNode);
}

export interface SpeechOption {
  voice?: string;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface StateChangeEventDetail {
  voice?: string;
  isOn: boolean;
}

export class AzureTtsNode extends HTMLElement implements TextToSpeechProvider {
  private sentenceQueue = createSentenceQueue();
  private audioSink = new CustomOutputStream();
  private isStarted = false;
  private sub: Subscription | null = null;

  private finishCallbacks: Map<string, () => void> = new Map();

  connectedCallback() {
    this.setAttribute("provides", "tts");

    this.sub = this.sentenceQueue.sentenceQueue
      .pipe(
        filter((block) => !!block),
        concatMap(async (block) => {
          const connection = this.closest<AIBar>("ai-bar")?.getAzureConnection();
          if (!connection)
            throw new Error("Unable to get credentials from the closest <ai-bar>. Did you forget to provide them?");

          const result = await synthesizeSpeech({
            apiKey: connection.speechKey,
            region: connection.speechRegion,
            text: block.text,
            voice: block.options?.voice ?? this.getAttribute("voice") ?? undefined,
            rate: this.getAttribute("rate") ?? undefined,
          }).catch(() => null);

          return { block, audio: result };
        }),
      )
      .subscribe((data) => {
        if (data.audio === null) {
          console.warn(`speech synthesis error ${data.block.text}`);
          return;
        }

        this.audioSink.appendBuffer(data.audio, {
          onPlayStart: () => {
            console.log(`[azure-tts:speaking] ${data.block.text}`);
            data.block.options?.onStart?.();
            this.dispatchEvent(
              new CustomEvent<StateChangeEventDetail>("statechange", {
                detail: { voice: data.block.options?.voice, isOn: true },
              }),
            );
          },
          onPlayEnd: () => {
            console.log(`[azure-tts:spoken] ${data.block.text}`);
            data.block.options?.onEnd?.();
            this.dispatchEvent(
              new CustomEvent<StateChangeEventDetail>("statechange", {
                detail: { voice: data.block.options?.voice, isOn: false },
              }),
            );
            if (this.finishCallbacks.has(data.block.text)) {
              this.finishCallbacks.get(data.block.text)?.();
              this.finishCallbacks.delete(data.block.text);
            }
          },
        });
      });
  }

  disconnectedCallback() {
    this.sub?.unsubscribe();
  }

  startSpeaker(): void {
    this.audioSink.start();
  }

  async queue(text: string, options?: SpeechOption) {
    const deferred = Promise.withResolvers<void>();

    console.log(`[azure-tts:enqueue] ${text}`);
    if (!this.isStarted) {
      this.audioSink.start();
      this.isStarted = true;
    }

    this.finishCallbacks.set(text, deferred.resolve);
    this.sentenceQueue.enqueue(text, options);

    return deferred.promise;
  }

  clear(): void {
    this.audioSink.pause();
    this.isStarted = false;
    // this.audioSink.start();
  }
}

function createSentenceQueue() {
  const sentence$ = new Subject<{ text: string; options?: SpeechOption }>();

  function enqueue(text: string, options?: SpeechOption) {
    if (text.trim()) {
      sentence$.next({ text, options });
    }
  }

  return {
    sentenceQueue: sentence$ as Observable<{ text: string; options?: SpeechOption }>,
    enqueue,
  };
}

interface InputParams {
  apiKey: string;
  text: string;
  region?: string; // default "eastus"
  voice?: string; // default "en-US-AndrewMultilingualNeural"
  rate?: string; // default 1.2
}

async function synthesizeSpeech({ apiKey, text, region, voice, rate }: InputParams): Promise<Uint8Array> {
  const ssml = `
    <speak version='1.0' xml:lang='en-US'>
      <voice xml:lang='en-US' name='${voice ?? "en-US-AndrewMultilingualNeural"}'>
        <prosody rate="${rate ?? 1.2}">
          ${text}
        </prosody>
      </voice>
    </speak>
  `;

  try {
    const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      },
      body: ssml,
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("Response body is empty");
    }

    // response.arrayBuffer().then((buffer) => audioSink.appendBuffer(new Uint8Array(buffer)));
    return response.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  } catch (error) {
    console.error("Error synthesizing speech:", error);
    throw new Error("Error synthesizing speech. Check the console for details.");
  }
}
