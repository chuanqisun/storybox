import { micah } from "@dicebear/collection";
import { createAvatar } from "@dicebear/core";

import "./avatar-element.css";

const people = [
  { name: "Aidan", gender: "Male", voiceId: "en-US-AndrewMultilingualNeural" },
  { name: "Avery", gender: "Male", voiceId: "en-US-BrianMultilingualNeural" },
  { name: "Christopher", gender: "Male", voiceId: "en-US-GuyNeural" },
  { name: "Emery", gender: "Male", voiceId: "en-US-DavisNeural" },
  { name: "Jack", gender: "Male", voiceId: "en-US-BrandonNeural" },
  { name: "Oliver", gender: "Male", voiceId: "en-US-JasonNeural" },
  { name: "Sawyer", gender: "Male", voiceId: "en-US-TonyNeural " },
  { name: "Leah", gender: "Female", voiceId: "en-US-AvaMultilingualNeural" },
  { name: "Mackenzie", gender: "Female", voiceId: "en-US-EmmaMultilingualNeural" },
  { name: "Riley", gender: "Female", voiceId: "en-US-JennyNeural" },
  { name: "Sara", gender: "Female", voiceId: "en-US-AriaNeural" },
  { name: "Sophia", gender: "Female", voiceId: "en-US-JaneNeural" },
  { name: "Valentina", gender: "Female", voiceId: "en-US-SaraNeural" },
  { name: "Vivian", gender: "Female", voiceId: "en-US-NancyNeural " },
];

const pickedPersons = new Set<any>();
export function getRandomPerson() {
  const pool = people.filter((person) => !pickedPersons.has(person));
  const remainingMales = pool.filter((person) => person.gender === "Male");
  const remainingFemales = pool.filter((person) => person.gender === "Female");
  const diversePool = remainingMales.length > remainingFemales.length ? remainingMales : remainingFemales;
  const person = diversePool[Math.floor(Math.random() * diversePool.length)];
  pickedPersons.add(person);
  return person;
}

export function defineAvatarElement() {
  customElements.define("avatar-element", AvatarElement);
}

export class AvatarElement extends HTMLElement {
  static observedAttributes = ["data-name", "data-mouth"];

  constructor() {
    super();
    const randomPerson = getRandomPerson();
    this.setAttribute("data-name", randomPerson.name);
    this.setAttribute("data-gender", randomPerson.gender);
    this.setAttribute("data-voice-id", randomPerson.voiceId);
    this.setAttribute("data-mouth", this.getAttribute("data-mouth") ?? "smile");
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    const updatedMouth = this.getAttribute("data-mouth") ?? "smile";
    const avatar = createAvatar(micah, { seed: this.getAttribute("data-name") ?? "", mouth: [updatedMouth as any] });
    this.innerHTML = `<button class="avatar-button">${avatar.toString()}<span class="name-plate">${this.getAttribute("data-name")}</span></button>`;
  }
}
