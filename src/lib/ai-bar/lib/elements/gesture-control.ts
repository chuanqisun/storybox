import { AIBar } from "../ai-bar";
import { attachShadowHtml } from "../wc-utils/attach-html";

export class GestureControl extends HTMLElement {
  shadowRoot = attachShadowHtml(
    this,
    `
    <style>
    canvas,video {
      display: block;
      max-width: 200px;
    }

    video {
      visibility: hidden
      width: 0;
      height: 0;
    }

    :host:not([debug]) {
      canvas {
        display: none;        
      }
    }

    button {
      font-size: 16px;
    }
    </style>
    <button title="Gesture control" aria-pressed="false">✌️</button>
  `
  );

  connectedCallback() {
    this.setAttribute("provides", "toolbar-item");

    // TODO add the full gesture canvas here.
    this.shadowRoot.querySelector("button")?.addEventListener("click", async () => {
      this.closest<AIBar>("ai-bar")?.dispatchEvent(new CustomEvent("start-gesture-control"));
    });
  }
}

export function defineGestureControl(tagName = "gesture-control") {
  customElements.define(tagName, GestureControl);
}
