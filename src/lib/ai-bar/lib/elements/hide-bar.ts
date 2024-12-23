import { emit } from "../events";
import { attachShadowHtml } from "../wc-utils/attach-html";

export class HideBar extends HTMLElement {
  shadowRoot = attachShadowHtml(this, `<button style="font-size: 16px" title="Hide">🙈</button>`);

  connectedCallback() {
    this.setAttribute("provides", "toolbar-item");

    this.shadowRoot.querySelector("button")?.addEventListener("click", () => {
      emit(this, { hide: true });
    });
  }
}

export function defineHideBar(tagName = "hide-bar") {
  customElements.define(tagName, HideBar);
}
