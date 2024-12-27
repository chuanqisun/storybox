import { html, render } from "lit";
import {
  BehaviorSubject,
  concatMap,
  distinct,
  distinctUntilKeyChanged,
  filter,
  map,
  merge,
  of,
  Subject,
  Subscription,
  switchMap,
  tap,
} from "rxjs";
import z from "zod";
import { AvatarElement } from "../components/avatar-element";
import { LlmNode } from "../lib/ai-bar/lib/elements/llm-node";
import type { OpenAIRealtimeNode } from "../lib/ai-bar/lib/elements/openai-realtime-node";
import type { TogetherAINode } from "../lib/ai-bar/lib/elements/together-ai-node";
import { system, user } from "../lib/ai-bar/lib/message";
import { $, $all } from "../lib/dom";
import { parseJsonStream } from "../lib/json-stream";
import { tryParse } from "../lib/parse";
import { getVision } from "./vision";

export interface StoryState {
  stage: "new" | "customizing" | "editing" | "premiere";
  style: "realistic" | "flet" | "paper" | "manga";
  characters: StoryCharacter[];
  scenes: StoryScene[];
  story: string;
  guests: StoryGuest[];
  vision: string;
}

export interface StoryCharacter {
  dailyObject: string;
  characterName: string;
  characterDescription: string;
  imageUrl?: string;
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
  expression: string;
}

const realtime = $<OpenAIRealtimeNode>("openai-realtime-node")!;
const vision = getVision();
const togetherAINode = $<TogetherAINode>("together-ai-node")!;
const llmNode = $<LlmNode>("llm-node")!;
const timeline = $<HTMLElement>("#timeline")!;
const captionStatus = $<HTMLElement>("#caption-status")!;
const charactersGrid = $<HTMLElement>("#characters")!;
const audience = $<HTMLElement>("#audience")!;

const state$ = new BehaviorSubject<StoryState>({
  stage: "new",
  style: "realistic",
  characters: [],
  scenes: [],
  story: "",
  guests: [],
  vision: "",
});

const characterImagePrompt$ = new Subject<{ characterName: string; characterDescription: string }>();

const claymationStyle = `A claymation-style image with a warm, autumnal color palette. The lighting is soft and diffused, creating a gentle, almost nostalgic mood. The textures are highly tactile, emphasizing the handmade quality of the materials.  The overall aesthetic is whimsical and slightly surreal, with a focus on creating a sense of depth and detail despite the simplistic forms. The rendering style is painterly, with visible brushstrokes or sculpting marks adding to the handcrafted feel.  Colors are muted and slightly desaturated, with a predominance of oranges, browns, and greens.  The background is slightly blurred, drawing attention to the main focus.`;
const needleFeltedScene = `Render in Needle felted miniature scene. The color palette is muted and pastel, featuring various shades of orange, pink, green, and teal. The lighting is soft and diffused, creating a gentle, whimsical atmosphere. The overall style is reminiscent of children's book illustration, with a focus on texture and detail. The rendering is highly detailed, with a focus on the texture of the felt and the three-dimensionality of the miniature elements.  The scene is highly saturated, but the colors are soft and not harsh. The overall feel is cozy and inviting.`;
const styles = [claymationStyle, needleFeltedScene];

export class StoryEngine {
  private subs: Subscription[] = [];

  start() {
    const sharedSub = merge(this.useVisionLoadCounter()).subscribe();
    const stateSub = state$
      .pipe(
        tap((state) => console.log("debug state", state)),
        distinctUntilKeyChanged("stage"),
        switchMap(({ stage }) => {
          $<HTMLElement>(`[data-stage]`)?.setAttribute("data-stage", stage);

          switch (stage) {
            case "customizing": {
              return merge(
                this.useStableVision(),
                this.useCharacterBuilderInstruction(),
                this.useCharactersDisplay(),
                this.useIncrementalVision(),
                this.useCharacterGrid(),
              );
            }
            case "editing": {
              setTimeout(() => {
                realtime.appendUserMessage("Please create the opening scene now").createResponse();
              }, 1000);

              this.generateGuests();

              return merge(
                this.useSceneDisplay(),
                this.useRenderGuests(),
                this.useSceneEditorInstruction(),
                this.useStableVision(),
                this.useIncrementalVision(),
              );
            }

            case "premiere": {
              // Add logic for the premiere stage here
              return of();
            }
          }

          return of();
        }),
      )
      .subscribe();

    this.changeStage("customizing");

    this.subs.push(sharedSub, stateSub);
  }

  stop() {
    this.subs.forEach((sub) => sub.unsubscribe());
    this.subs = [];
  }

  useVisionLoadCounter() {
    return vision.pendingDescriptionCount$.pipe(
      tap((count) => {
        captionStatus.textContent = `${count} pending`;
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

  useCharactersDisplay() {
    return characterImagePrompt$.pipe(
      switchMap(async (prompt) => {
        togetherAINode.generateImageDataURL(prompt.characterDescription + ` ${claymationStyle}`).then((dataUrl) => {
          state$.next({
            ...state$.value,
            characters: state$.value.characters.map((e) =>
              e.characterName === prompt.characterName ? { ...e, imageUrl: dataUrl } : e,
            ),
          });
        });
      }),
    );
  }

  useCharacterBuilderInstruction() {
    return state$.pipe(
      distinct((state) => JSON.stringify([state.characters, state.vision])),
      tap((state) => {
        realtime
          .addDraftTool({
            name: "create_character",
            description: "Create a character in the story",
            parameters: z.object({
              dailyObject: z.string().describe("The real world object the user has shown"),
              characterName: z.string().describe("The name the character in the story"),
              characterDescription: z
                .string()
                .describe(
                  "Detailed description of the character, including age, ethnicity, gender, skin color, facial features, body build, hair style and color, clothing, etc",
                ),
            }),
            run: (args) => {
              const newCharacter: StoryCharacter = {
                dailyObject: args.dailyObject,
                characterName: args.characterName,
                characterDescription: args.characterDescription,
              };

              state$.next({
                ...state$.value,
                characters: [...state$.value.characters, newCharacter],
              });

              characterImagePrompt$.next({
                characterName: args.characterName,
                characterDescription: args.characterDescription,
              });

              return `Character added: ${args.dailyObject} represents ${args.characterName} (${args.characterDescription})`;
            },
          })
          .addDraftTool({
            name: "remove_character",
            description: "Remove a character in the story",
            parameters: z.object({
              characterName: z.string().describe("The name of the character in the story"),
            }),
            run: (args) => {
              const existing = state$.value.characters.find((e) => e.characterName === args.characterName);
              if (!existing) return "Character not found";

              state$.next({
                ...state$.value,
                characters: state$.value.characters.filter((e) => e.characterName !== args.characterName),
              });

              return `Character ${args.characterName} is removed.`;
            },
          })
          .addDraftTool({
            name: "change_character",
            description: "Change a character in the story",
            parameters: z.object({
              previousCharacterName: z.string().describe("The current name of the character in the story"),
              update: z
                .object({
                  characterName: z.string().describe("The name the character in the story"),
                  characterDescription: z
                    .string()
                    .describe(
                      "Detailed description of the character, including age, ethnicity, gender, skin color, facial features, body build, hair style and color, clothing, etc",
                    ),
                })
                .describe("The updated name and description of the character in the story"),
            }),
            run: (args) => {
              const existing = state$.value.characters.find((e) => e.characterName === args.previousCharacterName);
              if (!existing) return "Character not found";

              const updatedElement: StoryCharacter = {
                ...existing,
                characterName: args.update.characterName,
                characterDescription: args.update.characterDescription,
              };

              characterImagePrompt$.next({
                characterName: args.update.characterName,
                characterDescription: updatedElement.characterDescription,
              });

              state$.next({
                ...state$.value,
                characters: state$.value.characters.map((e) =>
                  e.characterName === args.previousCharacterName ? updatedElement : e,
                ),
              });

              return `Character changed: ${existing.dailyObject} now represents ${args.update.characterName} in the story.`;
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

                this.changeStage("editing");
              });

              return "Tell the use the story will start now.";
            },
          })
          .commitDraftTools()
          .updateSessionInstructions(
            `
You are a talented storyteller. You are helping user design the characters and objects of a story.
The user will show you daily objects they would like to use to represent the characters in the story.
Your job is to keep track of what each daily object represents in the story.

${
  state.characters.length
    ? `Here is what you and user have agreed on so far:

${state.characters
  .map((ele) =>
    `
Daily object: ${ele.dailyObject} 
Character: ${ele.characterName} (${ele.characterDescription})
  `.trim(),
  )
  .join("\n\n")}`
    : ""
}

The user is currently showing you: ${state.vision}

Now interact with the user in one of the following ways:
- Use the create_character tool to update your memory with the new information.
- Use change_character or remove_character tool to update your memory with the latest instruction from the user
- When user is ready, use the start_story tool to start the story. Do NOT start_story without user's explicit permission.

After each tool use, you MUST concisely tell user what you did.
          `.trim(),
          );
      }),
    );
  }

  useCharacterGrid() {
    return state$.pipe(
      map(
        (state) =>
          html`${state.characters.map(
            (character) => html`
              <div class="media-card">
                <img src="${character.imageUrl ?? `https://placehold.co/400?text=Sketching...`}" />
                <p>${character.characterName}</p>
              </div>
            `,
          )}`,
      ),
      tap((htmlTemplate) => render(htmlTemplate, charactersGrid)),
    );
  }

  async generateStory() {
    const aoai = llmNode.getClient("aoai");
    const story = await aoai.chat.completions.create({
      messages: [
        system`You are a talented story writer. Write a stunning narrative featuring these elements:

${state$.value.characters.map((ele) => `${ele.characterName} (${ele.characterDescription})`).join("\n")}

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

  useSceneDisplay() {
    return state$.pipe(
      map(
        (state) =>
          html`${state.scenes.map(
            (scene, i) => html`
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

  async generateGuests() {
    const guestAvatars = [...$all<AvatarElement>("avatar-element")];
    const names = guestAvatars.map((avatar) => avatar.getAttribute("data-name")!);

    state$.next({
      ...state$.value,
      guests: guestAvatars.map((avatar) => ({
        name: avatar.getAttribute("data-name")!,
        background: "General audience", // To be replaced after generation
        expression: "smile",
      })),
    });

    const stream = await llmNode
      .getClient("aoai")
      .chat.completions.create({
        stream: true,
        messages: [
          system`You are organizing a collaborative storytelling events. Based on the main characters of the story and the names of the provided guest list, infer the diverse and story related background for each guest. Respond in this valid JSON format:
{
  guests: {
    name: ${names.join(" | ")},
    background: string, // detailed background of the guest, including age, gender, ethnicity, hometown, occupation, and personal details related to the story
  }[]        
}
        `,
          user`
Main characters:
${state$.value.characters.map((ele) => `${ele.characterName} (${ele.characterDescription})`).join("\n")}

Guest list:
${guestAvatars.map((avatar, i) => `Guest ${i + 1}: ${avatar.getAttribute("data-name")!} (${avatar.getAttribute("data-gender")})`).join("\n")}
        `,
        ],
        model: "gpt-4o",
        temperature: 0.7,
        response_format: {
          type: "json_object",
        },
      })
      .then(parseJsonStream);

    stream
      .pipe(
        filter((value) => typeof value.key === "number"),
        tap((v) => {
          state$.next({
            ...state$.value,
            guests: state$.value.guests.map((guest) =>
              guest.name === (v.value as any).name ? { ...guest, background: (v.value as any).background } : guest,
            ),
          });
        }),
      )
      .subscribe();
  }

  useRenderGuests() {
    return state$.pipe(
      concatMap((state) => state.guests),
      tap((guest) => {
        const avatar = $<AvatarElement>(`avatar-element[data-name="${guest.name}"]`);
        avatar?.setAttribute("data-mouth", guest.expression);
        avatar?.setAttribute("data-background", guest.background);
      }),
    );
  }

  useSceneEditorInstruction() {
    return state$.pipe(
      distinct((state) => JSON.stringify([state.scenes, state.vision])),
      tap((state) => {
        realtime
          .addDraftTool({
            name: "add_next_scene",
            description: "Continue the story with a new scene",
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
            name: "edit_current_scene",
            description: "Edit the current scene",
            parameters: z.object({
              update: z
                .object({
                  narration: z.string().describe("The story narration for the scene in one short sentence"),
                  sceneDescription: z
                    .string()
                    .describe(
                      "A visual depiction of the scene in the story. Use your best imagination to fill in the appearance, relations of the characters, camera angle, lighting, surrounding. Do NOT mention everyday objects themselves. Instead, focus on what they represent",
                    ),
                })
                .describe("The updated narration and scene description for the current scene"),
            }),
            run: async (args) => {
              const dataUrl = await togetherAINode.generateImageDataURL(
                `${args.update.sceneDescription} ${claymationStyle}`,
              );

              state$.next({
                ...state$.value,
                scenes: state$.value.scenes.map((scene, i) =>
                  i === state$.value.scenes.length - 1
                    ? {
                        ...scene,
                        imageUrl: dataUrl,
                        narration: args.update.narration,
                        caption: args.update.sceneDescription,
                      }
                    : scene,
                ),
              });

              return `Scene ${state$.value.scenes.length} updated.`;
            },
          })
          .addDraftTool({
            name: "start_premiere",
            description: "Show the entire story as a movie",
            parameters: z.object({}),
            run: () => {
              this.changeStage("premiere");
              return "Done. Let user seat back and enjoy the story.";
            },
          })
          .commitDraftTools() // clear previous tools
          .updateSessionInstructions(
            `
You are a talented storyteller. You are developing a story with the user. 
You and the user have agreed on using the following daily objects to represent characters in the story:

${state.characters
  .map((ele) =>
    `
Daily object: ${ele.dailyObject} 
Character: ${ele.characterName} (${ele.characterDescription})
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
- Use add_next_scene tool to continue the story:
  - When developing the narration, do NOT deviate from the overall story.
  - When writing scene visual description, do NOT mention the daily objects themselves. Instead, focus on what they represent. Include details about their imaginary appearance, position, relation to the scene and each other, their color, shape, size,. Also mention camera angle, lighting, to help people visualize it.
  - After using the tool, you MUST respond with the narration
- Use edit_current_scene to edit the current scene.
  - After using the tool, concisely tell user what you did.
- When user has finished developing all the scenes, with user's permission, you can use start_premiere tool to show the story as a movie. Encourage user to wrap up within five scenes
          `.trim(),
          );
      }),
    );
  }

  changeStage(status: StoryState["stage"]) {
    state$.next({ ...state$.value, stage: status });
  }

  debugScenes() {
    state$.next({
      ...state$.value,
      stage: "editing",
      characters: [
        {
          characterName: "Mickey Mouse",
          characterDescription: "A friendly mouse with a red bowtie and white gloves",
          dailyObject: "A yellow rubber duck",
        },
      ],
      story: "Mickey Mouse had to find his way home",
    });
  }
}
