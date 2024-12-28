import { filter, fromEvent, map, tap } from "rxjs";
import { CameraNode } from "./lib/ai-bar/lib/elements/camera-node";
import { OpenAIRealtimeNode } from "./lib/ai-bar/lib/elements/openai-realtime-node";
import { loadAIBar } from "./lib/ai-bar/loader";
import { $, parseActionEvent } from "./lib/dom";
import { StoryEngine } from "./story-engine/story-engine";

import { defineAvatarElement } from "./components/avatar-element";
import type { AzureSttNode } from "./lib/ai-bar/lib/elements/azure-stt-node";
import type { AzureTtsNode } from "./lib/ai-bar/lib/elements/azure-tts-node";
import "./main.css";

loadAIBar();
defineAvatarElement();

const realtime = $<OpenAIRealtimeNode>("openai-realtime-node")!;
const connectButton = $<HTMLButtonElement>(`button[data-action="connect"]`)!;
const muteButton = $<HTMLButtonElement>(`button[data-action="mute"]`)!;
const cameraButton = $<HTMLButtonElement>(`button[data-action="enable-camera"]`)!;
const cameraNode = $<CameraNode>("camera-node")!;
const azureSttNode = $<AzureSttNode>("azure-stt-node")!;
const azureTtsNode = $<AzureTtsNode>("azure-tts-node")!;
const appLayout = $<HTMLElement>(".app-layout")!;

const storyEngine = new StoryEngine();

const globalClick$ = fromEvent(document, "click").pipe(
  map(parseActionEvent),
  filter((e) => e.action !== null),
  tap(async (e) => {
    switch (e.action) {
      case "toggle-mode": {
        const currentMode = appLayout.getAttribute("data-mode");
        if (currentMode === "debug") {
          appLayout.setAttribute("data-mode", "presenting");
        } else if (currentMode === "presenting") {
          appLayout.setAttribute("data-mode", "debug");
        }
        break;
      }
      case "connect": {
        connectButton.textContent = "Connecting...";
        await realtime.start();
        realtime.enableTranscription();
        storyEngine.start();
        azureSttNode.startMicrophone();
        azureTtsNode.startSpeaker();
        connectButton.textContent = "Disconnect";
        connectButton.dataset.action = "disconnect";
        break;
      }
      case "disconnect": {
        connectButton.textContent = "Connect";
        connectButton.dataset.action = "connect";
        storyEngine.stop();
        await realtime.stop();
        break;
      }
      case "mute": {
        muteButton.textContent = "Unmute";
        muteButton.dataset.action = "unmute";
        await realtime.muteMicrophone();
        break;
      }
      case "unmute": {
        muteButton.textContent = "Mute";
        muteButton.dataset.action = "mute";
        await realtime.unmuteMicrophone();
        break;
      }
      case "enable-camera": {
        cameraNode.start();
        cameraButton.dataset.action = "disable-camera";
        cameraButton.textContent = "Disable Camera";
        break;
      }
      case "disable-camera": {
        cameraNode.stop();
        cameraButton.dataset.action = "enable-camera";
        cameraButton.textContent = "Enable Camera";
        break;
      }
      case "debug-scenes": {
        storyEngine.debugScenes();
        break;
      }
      case "debug-trailer": {
        storyEngine.debugTrailer();
        break;
      }
      case "debug-danmu": {
        const Danmaku = (await import("danmaku")).default;
        const danmaku = new Danmaku({
          container: $("#danmu") as HTMLElement,
        });

        const item = {
          text: "hello!!!",
          style: {
            fontSize: "2vw",
            color: "white",
          },
        };

        danmaku.emit(item);
        danmaku.emit(item);
        danmaku.emit(item);
        danmaku.emit(item);
        danmaku.emit(item);
        danmaku.emit(item);

        break;
      }
    }
  }),
);

globalClick$.subscribe();
