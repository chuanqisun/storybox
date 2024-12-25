import { BehaviorSubject, distinct, distinctUntilKeyChanged, merge, of, Subscription, switchMap, tap } from "rxjs";
import z from "zod";
import type { OpenAIRealtimeNode } from "../lib/ai-bar/lib/elements/openai-realtime-node";
import { $ } from "../lib/dom";
import { getVision } from "./vision";

export interface StoryState {
  stage: "new" | "customizing" | "generating" | "playing";
  style: "realistic" | "flet" | "paper" | "manga";
  elements: StoryElement[];
  chapters: StoryChapter[];
  guests: StoryGuest[];
  customizerVision: string;
  playerVision: string;
}

export interface StoryElement {
  type: "character" | "object";
  sourceName: string;
  sourceDetails: string;
  targetName: string;
  targetDetails: string;
}

export interface StoryChapter {
  summary: string;
  scenes: StoryScene[];
}

export interface StoryScene {
  placeholderImgUrl: string;
  imageUrl?: string;
  caption: string;
}

export interface StoryGuest {
  name: string;
  background: string;
  comments: string[];
  expression: unknown; // TODO facial expression state
}

const realtime = $<OpenAIRealtimeNode>("openai-realtime-node")!;
const vision = getVision();

const state$ = new BehaviorSubject<StoryState>({
  stage: "new",
  style: "realistic",
  elements: [],
  chapters: [],
  guests: [],
  customizerVision: "",
  playerVision: "",
});

export class StoryEngine {
  private subs: Subscription[] = [];
  start() {
    const sub = state$
      .pipe(
        tap((state) => console.log("debug state", state)),
        distinctUntilKeyChanged("stage"),
        switchMap(({ stage: status }) => {
          switch (status) {
            case "customizing":
              const customizerVision = this.useCustomizerVision$();
              const customizerInstruction = this.useCustomizerInstruction();
              return merge(customizerVision, customizerInstruction);
          }

          return of();
        }),
      )
      .subscribe();

    this.changeStage("customizing");

    this.subs.push(sub);
  }

  stop() {
    this.subs.forEach((sub) => sub.unsubscribe());
    this.subs = [];
  }

  changeStage(status: StoryState["stage"]) {
    state$.next({ ...state$.value, stage: status });
  }

  useCustomizerVision$() {
    return vision.stableVision$.pipe(
      tap((visionUpdate) => {
        state$.next({ ...state$.value, customizerVision: visionUpdate.description });
      }),
    );
  }

  useCustomizerInstruction() {
    return state$.pipe(
      distinct((state) => JSON.stringify([state.elements, state.customizerVision])),
      tap((state) => {
        realtime
          .addDraftTool({
            name: "upsert_character",
            description: "Crreate or Update a character in the story",
            parameters: z.object({
              inStory: z.object({
                name: z.string().describe("The name the character in the story"),
                description: z
                  .string()
                  .describe(
                    "Detailed description of the character, including age, ethnicity, gender, skin color, facial features, body build, hair style and color, clothing, etc",
                  ),
              }),
              inRealLife: z.object({
                name: z.string().describe("The real world object the user has shown"),
                description: z
                  .string()
                  .describe("Detailed description of the object, including color, shape, size, texture, etc"),
              }),
            }),
            run: (args) => {
              const hasExisting = state$.value.elements.find((e) => e.sourceName === args.inRealLife.name);

              const updatedElement: StoryElement = {
                type: "character",
                sourceName: args.inRealLife.name,
                sourceDetails: args.inRealLife.description,
                targetName: args.inStory.name,
                targetDetails: args.inStory.description,
              };

              state$.next({
                ...state$.value,
                elements: hasExisting
                  ? state$.value.elements.map((e) => (e.sourceName === args.inRealLife.name ? updatedElement : e))
                  : [...state$.value.elements, updatedElement],
              });

              return `Memory updated. ${args.inRealLife.name} represents ${args.inStory.name} in the story.`;
            },
          })
          .commitDraftTools()
          .updateSessionInstructions(
            `
You are a talented storyteller. You are helping user design the characters and objects of a story.
The user will show you arbitrary objects they would like to use to represent the characters or objects in the story.
Your job is to keep track of what each daily object represents in the story.

Here is your memory so far

${state.elements
  .map((ele) =>
    `
Type: ${ele.type}
Story element: ${ele.targetName} (${ele.targetDetails})
Daily object: ${ele.sourceName} (${ele.sourceDetails})
  `.trim(),
  )
  .join("\n\n")}

The user is currently showing you: ${state.customizerVision}

Now interact with the user in one of the following ways:
- Chat with the user to help them find good every objects. Be creative and practical.
- Use the upsert_character tool to update your memory with the new information.
- When user is ready to start the story, use the start_story tool to start the story.
          `.trim(),
          );
      }),
    );
  }
}
