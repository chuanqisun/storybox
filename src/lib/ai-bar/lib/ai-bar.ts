import type { AIBarEventDetail } from "./events";
import type {
  AzureConnectionProvider,
  LlmProvider,
  RecordingStatusProvider,
  SpeechToTextProvider,
  TextToSpeechProvider,
  VisionProvider,
} from "./types";
import { attachShadowHtml } from "./wc-utils/attach-html";

export * from "./events";
export * from "./types";

export class AIBar extends HTMLElement {
  shadowRoot = attachShadowHtml(
    this,
    `
    <style>
:host {
  *,*::before,*::after {
    box-sizing: border-box;
  }

  #widget-container {
    top: 16px;
    left: 50%;
    position: fixed;
    display: flex;
    width: max-content;
    transform: translate(calc(var(--offsetX, 0px) - 50%), var(--offsetY, 0));
    box-shadow: 0 3px 7px 0 rgba(0, 0, 0, .13), 0 1px 2px 0 rgba(0, 0, 0, .11);
    z-index: 2147483647;
  }
}
    </style>
    <div id="widget-container">
      <slot name="toolbar"></slot>
    </div>
`,
  );

  connectedCallback() {
    this.querySelector("script")?.remove();
    this.querySelectorAll(`[provides*="toolbar-item"]`).forEach((el) => el.setAttribute("slot", "toolbar"));

    this.addEventListener("event", (event) => {
      const typedEvent = event as CustomEvent<AIBarEventDetail>;
      this.handleStartPushToTalk(typedEvent);
      this.handleStopPushToTalk(typedEvent);
      this.handleRecognition(typedEvent);
      this.handleGenerated(typedEvent);
      this.handleDragged(typedEvent);
      this.handleTextSubmitted(typedEvent);
      this.handleHide(typedEvent);
      this.handleToolUsed(typedEvent);
    });

    if (this.hasAttribute("auto-hide")) {
      const cancel = setTimeout(() => {
        this.style.display = "none";
      }, 3000);

      this.addEventListener("click", () => clearTimeout(cancel));
    }

    if (this.hasAttribute("hidden")) {
      this.style.display = "none";
    }
  }

  public getAzureConnection() {
    const provider = this.querySelector<AzureConnectionProvider>(`[provides*="aoai-credentials"]`);
    if (!provider) throw new Error("No credentials provider found");

    const cred = provider.getAzureConnection();
    if (!cred) throw new Error("No credential provided by the provider");

    return cred;
  }

  public startRecording() {
    this.querySelector<TextToSpeechProvider>(`[provides*="tts"]`)?.clear();
    this.querySelector<SpeechToTextProvider>(`[provides*="stt"]`)?.start();
    this.querySelector<LlmProvider>(`[provides*="llm"]`)?.abort?.();
    this.querySelector<RecordingStatusProvider>(`[provides*="recording-status"]`)?.setIsRecording(true);
  }

  public stopRecording() {
    this.querySelector<SpeechToTextProvider>(`[provides*="stt"]`)?.stop();
    this.querySelector<RecordingStatusProvider>(`[provides*="recording-status"]`)?.setIsRecording(false);
  }

  public speak(content: string, config: { updateThread?: boolean; interrupt?: boolean } = {}) {
    if (config.interrupt) {
      this.querySelector<TextToSpeechProvider>(`[provides*="tts"]`)?.clear();
    }

    if (config.updateThread) {
      this.querySelector<LlmProvider>(`[provides*="llm"]`)?.appendAssistantMessage(content);
    } else {
      this.querySelector<TextToSpeechProvider>(`[provides*="tts"]`)?.queue(content);
    }
  }

  public async speakAsync(content: string) {
    return await this.querySelector<TextToSpeechProvider>(`[provides*="tts"]`)?.queue(content);
  }

  public async getContextVision(): Promise<string | null> {
    const url = (await this.querySelector<VisionProvider>(`[provides*="vision"]`)?.getImageDataUrl()) ?? null;
    return url;
  }

  private handleStartPushToTalk(typedEvent: CustomEvent<AIBarEventDetail>) {
    if (!typedEvent.detail.pttPressed) return;
    typedEvent.stopPropagation();

    this.startRecording();
  }

  private handleStopPushToTalk(typedEvent: CustomEvent<AIBarEventDetail>) {
    if (!typedEvent.detail.pttReleased) return;
    typedEvent.stopPropagation();

    this.stopRecording();
  }

  private handleRecognition(typedEvent: CustomEvent<AIBarEventDetail>) {
    if (!typedEvent.detail.recognized) return;
    typedEvent.stopPropagation();

    if (typedEvent.detail.recognized.isFinal) {
      this.querySelector<LlmProvider>(`[provides*="llm"]`)?.submit(typedEvent.detail.recognized.text);
    }
  }

  private handleToolUsed(typedEvent: CustomEvent<AIBarEventDetail>) {
    if (!typedEvent.detail.toolUsed) return;
    typedEvent.stopPropagation();

    this.dispatchEvent(new CustomEvent("tool-used", { detail: typedEvent.detail.toolUsed }));
  }

  private handleGenerated(typedEvent: CustomEvent<AIBarEventDetail>) {
    if (!typedEvent.detail.sentenceGenerated) return;
    typedEvent.stopPropagation();

    // assuming whole sentence
    const toolUsePattern = /<use-tool name="([^"]+)" parameter="([^"]+)"><\/use-tool>/;

    const match = typedEvent.detail.sentenceGenerated.match(toolUsePattern);
    if (match) {
      const name = match[1];
      const parameter = match[2];
      console.log({ name, parameter });
      this.dispatchEvent(new CustomEvent("use-tool", { detail: { name, parameter } }));
    }

    const textWithoutToolUse = typedEvent.detail.sentenceGenerated.replace(toolUsePattern, "").trim();

    if (textWithoutToolUse) {
      this.querySelector<TextToSpeechProvider>(`[provides*="tts"]`)?.queue(textWithoutToolUse);
    }
  }

  private handleDragged(typedEvent: CustomEvent<AIBarEventDetail>) {
    if (!typedEvent.detail.dragged) return;
    typedEvent.stopPropagation();

    this.style.setProperty("--offsetX", typedEvent.detail.dragged.deltaX + "px");
    this.style.setProperty("--offsetY", typedEvent.detail.dragged.deltaY + "px");
  }

  private handleTextSubmitted(typedEvent: CustomEvent<AIBarEventDetail>) {
    if (!typedEvent.detail.textSubmitted) return;
    typedEvent.stopPropagation();

    this.querySelector<LlmProvider>(`[provides*="llm"]`)?.submit(typedEvent.detail.textSubmitted);
  }

  private handleHide(typedEvent: CustomEvent<AIBarEventDetail>) {
    if (!typedEvent.detail.hide) return;
    typedEvent.stopPropagation();
    this.dispatchEvent(new CustomEvent("hide"));

    this.style.display = "none";
  }
}

export function defineAIBar(tagName = "ai-bar") {
  customElements.define(tagName, AIBar);
}
