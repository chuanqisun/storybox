import { defineAIBar } from "./lib/ai-bar";
import { defineAzureConnection } from "./lib/elements/azure-connection";
import { defineAzureDalleNode } from "./lib/elements/azure-dalle-node";
import { defineAzureSttNode } from "./lib/elements/azure-stt-node";
import { defineAzureTtsNode } from "./lib/elements/azure-tts-node";
import { defineDragHandle } from "./lib/elements/drag-handle";
import { defineElevenLabsTtsNode } from "./lib/elements/eleven-labs-tts-node";
import { defineGestureControl } from "./lib/elements/gesture-control";
import { defineHideBar } from "./lib/elements/hide-bar";
import { defineLlmNode } from "./lib/elements/llm-node";
import { defineScreenCapture } from "./lib/elements/screen-capture";
import { defineSttNode } from "./lib/elements/stt-node";
import { defineTextChat } from "./lib/elements/text-chat";
import { defineTtsNode } from "./lib/elements/tts-node";
import { defineWalkieTalkieButton } from "./lib/elements/walkie-talkie-button";

export function loadAIBar() {
  // check if the custom element is already defined
  if (customElements.get("text-chat")) {
    return;
  }

  defineTextChat();
  defineDragHandle();
  defineAzureConnection();
  defineAzureTtsNode();
  defineAzureSttNode();
  defineHideBar();
  defineLlmNode();
  defineTtsNode();
  defineScreenCapture();
  defineSttNode();
  defineWalkieTalkieButton();
  defineGestureControl();
  defineElevenLabsTtsNode();
  defineAzureDalleNode();

  defineAIBar();
}
