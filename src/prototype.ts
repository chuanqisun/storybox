import "img-comparison-slider";
import { characterSets } from "./prototype-data/characters";
import { scenes } from "./prototype-data/scenes";
import { styles } from "./prototype-data/styles";
import "./prototype.css";

document.querySelectorAll("[data-options]").forEach((el) => {
  el.innerHTML = styles.map((style) => `<button data-select="${style.name}">${style.name}</button>`).join("");
});

document.addEventListener("click", (e) => {
  const selectedStyleName = (e.target as HTMLElement)?.closest("[data-select]")?.getAttribute("data-select");
  const selectedStyle = styles.find((style) => style.name === selectedStyleName);
  if (!selectedStyle) return;

  const selectedIndex = styles.indexOf(selectedStyle);

  // update selection state
  document.querySelectorAll(`[data-select]`).forEach((el) => {
    el.toggleAttribute("data-selected", el.getAttribute("data-select") === selectedStyleName);
  });

  // update all display images
  document.querySelectorAll<HTMLImageElement>(`img[slot="second"]`).forEach((el) => {
    const category = el.closest("[data-category]")?.getAttribute("data-category");
    el.src = `${import.meta.env.BASE_URL}/images/${category}-${selectedIndex + 1}.webp`;
  });

  // update all descriptions
  document.querySelectorAll<HTMLParagraphElement>(`[data-category] p`).forEach((el) => {
    const category = el.closest("[data-category]")?.getAttribute("data-category");
    switch (category) {
      case "style":
        el.textContent = styles.at(selectedIndex)?.description ?? "Error";
        break;

      case "scene":
        el.textContent = scenes.at(selectedIndex) ?? "Error";
        break;
    }
  });

  const characterListHTML = `
  ${characterSets
    .at(selectedIndex)
    ?.map(
      (character) => `
      <div>
    <b>${character.name}</b>
    <p>${character.description}</p>
    </div>
  `,
    )
    .join("")}
  `;

  document.querySelector("#character-list")!.innerHTML = characterListHTML;
});
