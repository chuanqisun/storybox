import type React from "react";

export const personas = [
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
] as const;

export const allowedNames = personas.map((persona) => persona.name);

export interface AvatarProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  alt: (string & {}) | ((typeof allowedNames)[number] & {});
}
export const Avartar: React.FC<AvatarProps> = (props) => {
  const { src, alt, ...rest } = props;

  if (!allowedNames.includes(alt as any)) {
    console.warn(`Avatar alt "${alt}" is not recognized`);
  }

  return <img src={`https://api.dicebear.com/9.x/micah/svg?seed=${props.alt}`} draggable={false} {...rest} />;
};

export async function generateEmojiGroup(options: {
  targetElement?: HTMLElement;
  emojisPerSecond: number;
  durationSeconds: number;
  delaySeconds: number;
  emoji?: string;
}) {
  const { targetElement, emojisPerSecond, durationSeconds, delaySeconds, emoji } = options;

  await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));

  const totalEmojis = emojisPerSecond * durationSeconds;

  // scattered emojis randomly with the duration
  for (let i = 0; i < totalEmojis; i++) {
    setTimeout(
      () => {
        generateEmoji(targetElement ?? document.body, emoji);
      },
      Math.random() * durationSeconds * 1000,
    );
  }
}

export const generateEmoji = (targetElement: HTMLElement, emoji = "😊") => {
  const element = document.createElement("div");
  element.innerHTML = emoji;
  element.style.position = "absolute";
  element.style.bottom = `calc(50% - 32px)`;
  element.style.left = `calc(50% - 32px)`;
  element.style.fontSize = "64px";
  element.style.width = "64px";
  element.style.height = "64px";
  element.style.display = "flex";
  element.style.justifyContent = "center";
  element.style.alignItems = "center";

  targetElement.appendChild(element);

  // integer [-16..16]
  const xMomentum = Math.floor(Math.random() * 33) - 16;

  // animate emoji to float up while swing left and right like a balloon
  const animation = element.animate(
    [
      { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
      { transform: `translate(${xMomentum}px, -10vh) rotate(${xMomentum}deg)`, opacity: 1 },
      { transform: `translate(0px, -18vh) rotate(${-xMomentum}deg)`, opacity: 0.6 },
      { transform: `translate(${-xMomentum}px, -24vh) rotate(0deg)`, opacity: 0.4 },
      { transform: `translate(0px, -28vh) rotate(${-xMomentum}deg)`, opacity: 0 },
    ],
    {
      duration: 1000,
      easing: "linear",
    },
  );

  animation.onfinish = () => {
    element.remove();
  };
};
