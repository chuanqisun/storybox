import type { SpeechToTextProvider } from "../ai-bar";
import { emit } from "../events";

export class SttNode extends HTMLElement implements SpeechToTextProvider {
  // Prevent starting multiple sessions
  private isStarted = false;
  private recognition = new webkitSpeechRecognition();

  constructor() {
    super();
    this.recognition.interimResults = true;
  }

  connectedCallback() {
    this.setAttribute("provides", "stt");
  }

  private initSession() {
    this.isStarted = true;

    this.recognition.continuous = true;
    this.recognition.lang = "en-US";
    this.recognition.onstart = () => console.log("[recognition] session stated");
    this.recognition.onresult = (e) => {
      const latestItem = [...e.results].at(-1);
      if (!latestItem) return;
      emit(this, {
        recognized: {
          text: latestItem[0].transcript,
          isFinal: latestItem.isFinal,
        },
      });
    };
    this.recognition.onerror = (e) => {
      console.error(`[recognition] sliently omit error`, e);
    };
    this.recognition.onend = () => {
      this.isStarted = false;
      this.recognition.stop();
      console.log("[recognition] session ended");
      if (this.recognition.continuous) this.initSession();
    };
  }

  public start() {
    if (this.isStarted) return;
    this.initSession();
    this.recognition.start();
  }

  public stop() {
    this.recognition.continuous = false;
    this.recognition.stop();
  }

  public abort() {
    this.recognition.continuous = false;
    this.recognition.abort();
  }
}

export function defineSttNode(tagName = "stt-node") {
  customElements.define(tagName, SttNode);
}
