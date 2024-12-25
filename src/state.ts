export interface StoryState {
  status: "customizing" | "generating" | "playing";
  style?: string;
  elements: StoryElement[];
  chapters: StoryChapter[];
  guests: StoryGuest[];
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
