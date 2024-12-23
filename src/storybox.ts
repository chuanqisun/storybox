import type { AIBar } from "./lib/ai-bar/lib/ai-bar";
import { loadAIBar } from "./lib/ai-bar/loader";
import "./storybox.css";

loadAIBar();

const aiBar = document.querySelector<AIBar>("ai-bar");
