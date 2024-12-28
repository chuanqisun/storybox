import { $, $new } from "../lib/dom";

export function getCaption() {
  const captionElement = $<HTMLElement>("#closed-caption")!;
  const appendLine = (text: string) => {
    const captionLine = $new("p", {}, [text]);
    captionElement.appendChild(captionLine);
    captionLine.scrollIntoView({ behavior: "smooth" });
  };

  const appendPartial = (speaker: string, text: string) => {
    let targetLine = captionElement.lastElementChild;
    if (targetLine?.getAttribute("data-speaker") !== speaker) {
      targetLine = $new("p", { "data-speaker": speaker }, [`${speaker}: `]);
      captionElement.appendChild(targetLine);
    }

    targetLine.textContent += text;
    targetLine.scrollIntoView({ behavior: "smooth" });
  };

  return {
    appendLine,
    appendPartial,
  };
}
