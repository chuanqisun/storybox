import { emit } from "../events";
import type { RecordingStatusProvider } from "../types";
import { attachShadowHtml } from "../wc-utils/attach-html";

export class WalkieTalkieButton extends HTMLElement implements RecordingStatusProvider {
  shadowRoot = attachShadowHtml(
    this,
    `
<button style="font-size: 16px;">
  <span part="leading-visual">🎙️</span>
  <span part="label">Hold to talk</span>
</button>
    `
  );

  connectedCallback() {
    this.setAttribute("provides", "toolbar-item recording-status");
    this.shadowRoot.querySelector("button")!.addEventListener("mousedown", () => {
      emit(this, {
        pttPressed: true,
      });
      this.shadowRoot.querySelector<HTMLElement>(`[part="label"]`)!.innerText = "Release to send";
    });

    this.shadowRoot.querySelector("button")!.addEventListener("mouseup", () => {
      emit(this, {
        pttReleased: true,
      });
      this.shadowRoot.querySelector<HTMLElement>(`[part="label"]`)!.innerText = "Hold to talk";
    });
  }

  setIsRecording(isRecording: boolean): void {
    if (isRecording) {
      this.shadowRoot.querySelector<HTMLElement>(`[part="label"]`)!.innerText = "Release to send";
    } else {
      this.shadowRoot.querySelector<HTMLElement>(`[part="label"]`)!.innerText = "Hold to talk";
    }
  }
}

export function defineWalkieTalkieButton(tagName = "walkie-talkie-button") {
  customElements.define(tagName, WalkieTalkieButton);
}
