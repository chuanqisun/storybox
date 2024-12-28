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
