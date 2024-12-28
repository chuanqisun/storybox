import { defineAIBar } from "./lib/ai-bar";
import { defineAzureConnection } from "./lib/elements/azure-connection";
import { defineAzureDalleNode } from "./lib/elements/azure-dalle-node";
import { defineAzureSttNode } from "./lib/elements/azure-stt-node";
import { defineAzureTtsNode } from "./lib/elements/azure-tts-node";
import { defineCameraNode } from "./lib/elements/camera-node";
import { defineDragHandle } from "./lib/elements/drag-handle";
import { defineElevenLabsTtsNode } from "./lib/elements/eleven-labs-tts-node";
import { defineGestureControl } from "./lib/elements/gesture-control";
import { defineHideBar } from "./lib/elements/hide-bar";
import { defineLlmNode } from "./lib/elements/llm-node";
import { defineMicrophoneNode } from "./lib/elements/microphone-node";
import { defineOpenAIRealtimeNode } from "./lib/elements/openai-realtime-node";
import { defineScreenCapture } from "./lib/elements/screen-capture";
import { defineSttNode } from "./lib/elements/stt-node";
import { defineTextChat } from "./lib/elements/text-chat";
import { defineTogetherAINode } from "./lib/elements/together-ai-node";
import { defineTtsNode } from "./lib/elements/tts-node";
import { defineWalkieTalkieButton } from "./lib/elements/walkie-talkie-button";

export function loadAIBar() {
  // check if the custom element is already defined
  if (customElements.get("text-chat")) {
    return;
  }

  defineAzureConnection();
  defineAzureDalleNode();
  defineAzureSttNode();
  defineAzureTtsNode();
  defineCameraNode();
  defineDragHandle();
  defineElevenLabsTtsNode();
  defineGestureControl();
  defineHideBar();
  defineLlmNode();
  defineMicrophoneNode();
  defineOpenAIRealtimeNode();
  defineScreenCapture();
  defineSttNode();
  defineTogetherAINode();
  defineTextChat();
  defineTtsNode();
  defineWalkieTalkieButton();

  defineAIBar();
}
