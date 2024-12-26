import { html, render } from "lit";
import {
  BehaviorSubject,
  distinct,
  distinctUntilKeyChanged,
  map,
  merge,
  of,
  Subject,
  Subscription,
  switchMap,
  tap,
} from "rxjs";
import z from "zod";
import { ElevenLabsTtsNode } from "../lib/ai-bar/lib/elements/eleven-labs-tts-node";
import { LlmNode } from "../lib/ai-bar/lib/elements/llm-node";
import type { OpenAIRealtimeNode } from "../lib/ai-bar/lib/elements/openai-realtime-node";
import type { TogetherAINode } from "../lib/ai-bar/lib/elements/together-ai-node";
import { system } from "../lib/ai-bar/lib/message";
import { $ } from "../lib/dom";
import { tryParse } from "../lib/parse";
import { getVision } from "./vision";

export interface StoryState {
  stage: "new" | "customizing" | "playing";
  style: "realistic" | "flet" | "paper" | "manga";
  elements: StoryElement[];
  scenes: StoryScene[];
  story: string;
  guests: StoryGuest[];
  vision: string;
}

export interface StoryElement {
  type: "character" | "object";
  sourceName: string;
  sourceDetails: string;
  targetName: string;
  targetDetails: string;
}

export interface StoryScene {
  placeholderImgUrl: string;
  imageUrl?: string;
  narration: string;
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
const togetherAINode = $<TogetherAINode>("together-ai-node")!;
const visualOutput = $<HTMLImageElement>("#visual-output")!;
const llmNode = $<LlmNode>("llm-node")!;
const timeline = $<HTMLElement>("#timeline")!;
const tts = $<ElevenLabsTtsNode>("eleven-labs-tts-node")!;

const state$ = new BehaviorSubject<StoryState>({
  stage: "new",
  style: "realistic",
  elements: [],
  scenes: [],
  story: "",
  guests: [],
  vision: "",
});

const claymationStyle = `A claymation-style image with a warm, autumnal color palette.  The lighting is soft and diffused, creating a gentle, almost nostalgic mood. The textures are highly tactile, emphasizing the handmade quality of the materials.  The overall aesthetic is whimsical and slightly surreal, with a focus on creating a sense of depth and detail despite the simplistic forms. The rendering style is painterly, with visible brushstrokes or sculpting marks adding to the handcrafted feel.  Colors are muted and slightly desaturated, with a predominance of oranges, browns, and greens.  The background is slightly blurred, drawing attention to the main focus.`;
const needleFeltedScene = `Render in Needle felted miniature scene. The color palette is muted and pastel, featuring various shades of orange, pink, green, and teal. The lighting is soft and diffused, creating a gentle, whimsical atmosphere. The overall style is reminiscent of children's book illustration, with a focus on texture and detail. The rendering is highly detailed, with a focus on the texture of the felt and the three-dimensionality of the miniature elements.  The scene is highly saturated, but the colors are soft and not harsh. The overall feel is cozy and inviting.`;
const styles = [claymationStyle, needleFeltedScene];

export class StoryEngine {
  private subs: Subscription[] = [];
  private imagePrompt$ = new Subject<string>();

  start() {
    const sub = state$
      .pipe(
        tap((state) => console.log("debug state", state)),
        distinctUntilKeyChanged("stage"),
        switchMap(({ stage: status }) => {
          switch (status) {
            case "customizing": {
              const customizerVision = this.useStableVision();
              const customizerInstruction = this.useCustomizerInstruction();
              const customizerVisualOutput = this.useCustomizerVisualOutput();
              const incrementalVision = this.useIncrementalVision();
              return merge(customizerVision, customizerInstruction, customizerVisualOutput, incrementalVision);
            }
            case "playing": {
              const timeline = this.usePlayerTimeline();
              const playerInstruction = this.usePlayerInstruction();
              const playerVision = this.useStableVision();
              const incrementalVision = this.useIncrementalVision();

              setTimeout(() => {
                realtime.appendUserMessage("Please create the opening scene now").createResponse();
              }, 1000);

              return merge(timeline, playerInstruction, playerVision, incrementalVision);
            }
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

  usePlayerTimeline() {
    return state$.pipe(
      map(
        (state) =>
          html`${state.scenes.map(
            (scene, i) => html`
              <h2>Scene ${i + 1}</h2>
              <div class="scene">
                <img src="${scene.imageUrl ?? scene.placeholderImgUrl}" title="${scene.caption}" />
                <p>${scene.narration}</p>
              </div>
            `,
          )}`,
      ),
      tap((htmlTemplate) => render(htmlTemplate, timeline)),
    );
  }

  usePlayerInstruction() {
    return state$.pipe(
      distinct((state) => JSON.stringify([state.scenes, state.vision])),
      tap((state) => {
        realtime
          .addDraftTool({
            name: "continue_story",
            description: "Develop a new scene",
            parameters: z.object({
              narration: z.string().describe("The story narration for the scene in one short sentence"),
              sceneDescription: z
                .string()
                .describe(
                  "A visual depiction of the scene in the story. Use your best imagination to fill in the appearance, relations of the characters, camera angle, lighting, surrounding. Do NOT mention everyday objects themselves. Instead, focus on what they represent",
                ),
            }),
            run: async (args) => {
              const dataUrl = await togetherAINode.generateImageDataURL(`${args.sceneDescription} ${claymationStyle}`);

              state$.next({
                ...state$.value,
                scenes: [
                  ...state$.value.scenes,
                  {
                    placeholderImgUrl: dataUrl,
                    narration: args.narration,
                    caption: args.sceneDescription,
                  },
                ],
              });

              return `Scene ${state$.value.scenes.length} created. You must now respond with the narration: "${args.narration}"`;
            },
          })
          .addDraftTool({
            name: "end_story",
            description: "End the story",
            parameters: z.object({}),
            run: () => {
              this.changeStage("new");
              return "Story has ended. Ask user if they want to start a new one";
            },
          })
          .commitDraftTools() // clear previous tools
          .updateSessionInstructions(
            `
You are a talented storyteller. You are developing a story with the user. 
You and the user have agreed on using the following daily objects to represent elements in the story:

${state.elements
  .map((ele) =>
    `
Type: ${ele.type}
Story element: ${ele.targetName} (${ele.targetDetails})
Daily object: ${ele.sourceName} (${ele.sourceDetails})
  `.trim(),
  )
  .join("\n\n")}

This is the main story you must tell with the user: ${state.story}
${
  state.scenes.length
    ? `Here is the story you have developed so far:
${state.scenes.map((scene, i) => `Scene ${i + 1}: ${scene.narration}`).join("\n")}`
    : "You are ready to develop the first scene with the user."
}

Now work with the user to develop the story one scene at a time.
- Let user guide you with the objects they show and the words the say. The user is currently showing you: ${state.vision}
- Always use continue_story tool to continue the story:
  - When developing the narration, do NOT deviate from the overall story.
  - When writing scene visual description, do NOT mention the daily objects themselves. Instead, focus on what they represent. Include details about their imaginary appearance, position, relation to the scene and each other, their color, shape, size,. Also mention camera angle, lighting, to help people visualize it.
  - After using the tool, you MUST respond with the narration
- With user's permission, when you reach the end of the story, use end_story tool to end the story. Do NOT exceed five scenes
          `.trim(),
          );
      }),
    );
  }

  useStableVision() {
    return vision.stableVision$.pipe(
      tap((visionUpdate) => {
        state$.next({ ...state$.value, vision: visionUpdate.description });
      }),
    );
  }

  useIncrementalVision() {
    return vision.stableVision$.pipe(
      tap((visionUpdate) => {
        realtime.appendUserMessage(`Now I'm showing you: ${visionUpdate.description}`);
      }),
    );
  }

  useCustomizerVisualOutput() {
    return this.imagePrompt$.pipe(
      switchMap(async (prompt) => {
        // TODO implement abort control
        // TODO store the image with the character
        const dataUrl = await togetherAINode.generateImageDataURL(prompt + ` ${claymationStyle}`);
        visualOutput.src = dataUrl;
      }),
    );
  }

  useCustomizerInstruction() {
    return state$.pipe(
      distinct((state) => JSON.stringify([state.elements, state.vision])),
      tap((state) => {
        realtime
          .addDraftTool({
            name: "create_character",
            description: "Crreate a character in the story",
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
              const hasExisting = state$.value.elements.find((e) => e.targetName === args.inStory.name);

              const updatedElement: StoryElement = {
                type: "character",
                sourceName: args.inRealLife.name,
                sourceDetails: args.inRealLife.description,
                targetName: args.inStory.name,
                targetDetails: args.inStory.description,
              };

              this.imagePrompt$.next(updatedElement.targetDetails);

              state$.next({
                ...state$.value,
                elements: hasExisting
                  ? state$.value.elements.map((e) => (e.sourceName === args.inRealLife.name ? updatedElement : e))
                  : [...state$.value.elements, updatedElement],
              });

              return `Memory updated. ${args.inRealLife.name} represents ${args.inStory.name} in the story.`;
            },
          })
          .addDraftTool({
            name: "change_character",
            description: "Change a character in the story",
            parameters: z.object({
              currentInStoryName: z.string().describe("The current name of the character in the story"),
              inStory: z
                .object({
                  name: z.string().describe("The name the character in the story"),
                  description: z
                    .string()
                    .describe(
                      "Detailed description of the character, including age, ethnicity, gender, skin color, facial features, body build, hair style and color, clothing, etc",
                    ),
                })
                .describe("The updated name and description of the character in the story"),
            }),
            run: (args) => {
              const existing = state$.value.elements.find((e) => e.targetName === args.currentInStoryName);
              if (!existing) return "Character not found";

              const updatedElement: StoryElement = {
                ...existing,
                targetName: args.inStory.name,
                targetDetails: args.inStory.description,
              };

              this.imagePrompt$.next(updatedElement.targetDetails);

              state$.next({
                ...state$.value,
                elements: state$.value.elements.map((e) =>
                  e.targetName === args.currentInStoryName ? updatedElement : e,
                ),
              });

              return `Memory updated. ${existing.sourceName} now represents ${args.inStory.name} in the story.`;
            },
          })
          .addDraftTool({
            name: "start_story",
            description: "Start the story",
            parameters: z.object({}),
            run: () => {
              this.generateStory().then((story) => {
                if (!story.length) return "Error generating stories. Tell user to change the story or try again.";

                state$.next({
                  ...state$.value,
                  story,
                });

                this.changeStage("playing");
              });

              return "Tell the use the story will start now.";
            },
          })
          .commitDraftTools()
          .updateSessionInstructions(
            `
You are a talented storyteller. You are helping user design the characters and objects of a story.
The user will show you arbitrary objects they would like to use to represent the characters or objects in the story.
Your job is to keep track of what each daily object represents in the story.

${
  state.elements.length
    ? `Here is your memory so far

${state.elements
  .map((ele) =>
    `
Type: ${ele.type}
Story element: ${ele.targetName} (${ele.targetDetails})
Daily object: ${ele.sourceName} (${ele.sourceDetails})
  `.trim(),
  )
  .join("\n\n")}`
    : ""
}

The user is currently showing you: ${state.vision}

Now interact with the user in one of the following ways:
- Chat with the user to help them find good every objects. Be creative and practical.
- Use the create_character tool to update your memory with the new information.
- Use change_character tool to update your memory with the new information.
- When user is ready, use the start_story tool to start the story. Do NOT start_story without user's explicit permission.
          `.trim(),
          );
      }),
    );
  }

  async generateStory() {
    const aoai = llmNode.getClient("aoai");
    const story = await aoai.chat.completions.create({
      messages: [
        system`You are a talented story writer. Write a stunning narrative featuring these elements:

${state$.value.elements.map((ele) => `${ele.targetName} (${ele.targetDetails})`).join("\n")}

You must write a high level narrative for the story and leave out all the details. The narrative should be one very concise paragraph.

Respond in valid JSON, with the following type interface:

{
  story: string;
}
        
        `,
      ],
      model: "gpt-4o",
      response_format: {
        type: "json_object",
      },
    });

    const parsedStory = tryParse<{ story: string }>(story.choices[0].message.content!, {
      story: "",
    }).story;

    return parsedStory;
  }

  changeStage(status: StoryState["stage"]) {
    state$.next({ ...state$.value, stage: status });
  }
}
