import type { TextToSpeechProvider } from "../ai-bar";

export class TtsNode extends HTMLElement implements TextToSpeechProvider {
  private synth = window.speechSynthesis;
  private unspokenQueue: SpeechSynthesisUtterance[] = [];

  constructor() {
    super();
  }
  connectedCallback() {
    this.setAttribute("provides", "tts");
  }

  startSpeaker(): void {
    // No op
  }

  async queue(text: string) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.2;
    const preferredVoicesURIs = [
      "Microsoft AvaMultilingual Online (Natural) - English (United States)",
      "Microsoft Sonia Online (Natural) - English (United Kingdom)",
      "Arthur",
    ];

    const availableVoices = this.synth.getVoices().filter((v) => preferredVoicesURIs.includes(v.voiceURI));
    const bestVoice = availableVoices.sort((a, b) => preferredVoicesURIs.indexOf(a.voiceURI) - preferredVoicesURIs.indexOf(b.voiceURI)).at(0);
    if (bestVoice) utterance.voice = bestVoice;

    if (this.synth.speaking) {
      this.unspokenQueue.push(utterance);
    } else {
      this.synth.speak(utterance);
      utterance.onend = () => this.speakUntilEmpty();
    }
  }

  speakUntilEmpty() {
    if (this.unspokenQueue.length) {
      const utterance = this.unspokenQueue.shift()!;
      this.synth.speak(utterance);
      utterance.onend = () => this.speakUntilEmpty();
    }
  }

  clear() {
    this.unspokenQueue = [];
    this.synth.cancel();
  }
}

export function defineTtsNode(tagName = "tts-node") {
  customElements.define(tagName, TtsNode);
}
