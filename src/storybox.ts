import { filter, fromEvent, map, tap } from "rxjs";
import { OpenAIRealtimeNode } from "./lib/ai-bar/lib/elements/openai-realtime-node";
import { loadAIBar } from "./lib/ai-bar/loader";
import { $, parseActionEvent } from "./lib/dom";
import "./storybox.css";

loadAIBar();

const realtime = $<OpenAIRealtimeNode>("openai-realtime-node")!;
const connectButton = $<HTMLButtonElement>(`button[data-action="connect"]`)!;

const globalClick$ = fromEvent(document, "click").pipe(
  map(parseActionEvent),
  filter((e) => e.action !== null),
  tap(async (e) => {
    switch (e.action) {
      case "connect": {
        connectButton.textContent = "Connecting...";
        await realtime.start();
        connectButton.textContent = "Disconnect";
        connectButton.dataset.action = "disconnect";
        break;
      }
      case "disconnect": {
        connectButton.textContent = "Connect";
        connectButton.dataset.action = "connect";
        await realtime.stop();
        break;
      }
    }
  }),
);

globalClick$.subscribe();
