/* Query and Mutation helpers */
export const $ = document.querySelector.bind(document);
export const $all = document.querySelectorAll.bind(document);

interface CreateElement {
  <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attributes?: Record<string, string>,
    children?: (HTMLElement | string)[],
  ): HTMLElementTagNameMap[K];
  <T extends HTMLElement>(tag: string, attributes?: Record<string, string>, children?: (HTMLElement | string)[]): T;
}

export const $new: CreateElement = (
  tag: string,
  attributes: Record<string, string> = {},
  children: (HTMLElement | string)[] = [],
) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  for (const child of children) {
    element.append(child);
  }
  return element;
};

/* Event processing */
export interface ParsedActionEvent extends Event {
  trigger?: HTMLElement;
  action?: string | null;
}

export function parseActionEvent(e: Event): ParsedActionEvent {
  const actionTrigger = (e.target as HTMLElement).closest("[data-action]");
  if (!actionTrigger) return e;

  const action = actionTrigger.getAttribute("data-action");
  return {
    ...e,
    trigger: actionTrigger as HTMLElement,
    action,
  };
}

export function preventDefault(e: Event) {
  e.preventDefault();
}

export function stopPropagation(e: Event) {
  e.stopPropagation();
}

export function getTargetValue(e: Event) {
  return (e.target as HTMLInputElement).value ?? "";
}

export function getDetail<T>(e: Event) {
  return (e as CustomEvent<T>).detail;
}

export interface KeyboardShortcut {
  /**  format: "[Ctrl+][Alt+][Shift+]<event.code>" https://www.toptal.com/developers/keycode */
  combo: string;
  event: KeyboardEvent;
}

const MODIFIERS = ["Control", "Alt", "Shift", "Meta"];
export function isModifierKey(event: KeyboardEvent) {
  return MODIFIERS.includes(event.key);
}

export function parseKeyboardShortcut(event: KeyboardEvent): KeyboardShortcut | null {
  if (isModifierKey(event)) return null;

  const combo = [event.ctrlKey ? "Ctrl" : "", event.altKey ? "Alt" : "", event.shiftKey ? "Shift" : "", event.code]
    .filter(Boolean)
    .join("+");
  return { combo, event };
}
