import type { ChatCompletionTool } from "openai/resources/index.mjs";

export interface SpeechToTextProvider extends HTMLElement {
  start(): void;
  stop(): void;
  abort(): void;
  /** Use this activate microphone after user interaction */
  startMicrophone?(): void;
}

export interface TextToSpeechProvider extends HTMLElement {
  queue(text: string): void | Promise<void>;
  /** Use this activate speaker after user interaction */
  startSpeaker(): void;
  clear(): void;
}

export interface LlmProvider extends HTMLElement {
  abort?(): void;
  appendAssistantMessage(text: string): void;
  clear(): void;
  submit(text: string): void;
  setTools: (tools: ChatCompletionTool[]) => void;
}

export interface VisionProvider extends HTMLElement {
  getImageDataUrl(): Promise<string | null>;
}

export interface RecordingStatusProvider extends HTMLElement {
  setIsRecording(isRecording: boolean): void;
}

export interface AzureConnectionProvider extends HTMLElement {
  getAzureConnection(): {
    aoaiEndpoint: string;
    aoaiDeploymentName: string;
    aoaiKey: string;
    elevenLabsKey: string;
    mapKey: string;
    speechRegion: string;
    speechKey: string;
    aoaiEndpoint2: string;
    aoaiKey2: string;
  };
}

export interface Tool {
  name: string;
  parameterOptions: string[];
}
