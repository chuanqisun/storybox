export const styles = {
  claymation: `A claymation-style image with a warm, autumnal color palette. The lighting is soft and diffused, creating a gentle, almost nostalgic mood. The textures are highly tactile, emphasizing the handmade quality of the materials.  The overall aesthetic is whimsical and slightly surreal, with a focus on creating a sense of depth and detail despite the simplistic forms. The rendering style is painterly, with visible brushstrokes or sculpting marks adding to the handcrafted feel.  Colors are muted and slightly desaturated, with a predominance of oranges, browns, and greens.  The background is slightly blurred, drawing attention to the main focus.`,
  needleFelted: `Needle felted miniature scene. Captured with tilt-shift lens. The color palette is muted and pastel, featuring various shades of orange, pink, green, and teal. The lighting is soft and diffused, creating a gentle, whimsical atmosphere. The overall style is reminiscent of children's book illustration, with a focus on texture and detail. The rendering is highly detailed, with a focus on the texture of the felt and the three-dimensionality of the miniature elements.  The scene is highly saturated, but the colors are soft and not harsh. The overall feel is cozy and inviting.`,
};

export function getScenePrompt(subject: string) {
  return `Superhero Comic graphic novel illustration. Rich, saturated colors paired with strong, detailed outlines. ${subject}`;
}

export function getCharacterPrompt2(subject: string) {
  return `Mugshot view of a single character. ${subject} Claymation-style against solid contrasting color background. Use a warm, autumnal color palette. The lighting is soft and diffused, creating a gentle, almost nostalgic mood. The textures are highly tactile, emphasizing the handmade quality of the materials.  The overall aesthetic is whimsical and slightly surreal, with a focus on creating a sense of depth and detail despite the simplistic forms. The rendering style is painterly, with visible brushstrokes or sculpting marks adding to the handcrafted feel.  Colors are muted and slightly desaturated, with a predominance of oranges, browns, and greens.  The background is slightly blurred, drawing attention to the main focus.`;
}

export function getCharacterPrompt(subject: string) {
  return `Mugshot view of a single character. ${subject} Claymation-style against solid contrasting color background. Use a warm, autumnal color palette. The lighting is soft and diffused, creating a gentle, almost nostalgic mood. The textures are highly tactile, emphasizing the handmade quality of the materials.  The overall aesthetic is whimsical and slightly surreal, with a focus on creating a sense of depth and detail despite the simplistic forms. The rendering style is painterly, with visible brushstrokes or sculpting marks adding to the handcrafted feel.  Colors are muted and slightly desaturated, with a predominance of oranges, browns, and greens.  The background is slightly blurred, drawing attention to the main focus.`;
}

export function getTrailPrompt(subject: string) {
  return `${subject} Claymation-style against solid contrasting color background. Use a warm, autumnal color palette. The lighting is soft and diffused, creating a gentle, almost nostalgic mood. The textures are highly tactile, emphasizing the handmade quality of the materials.  The overall aesthetic is whimsical and slightly surreal, with a focus on creating a sense of depth and detail despite the simplistic forms. The rendering style is painterly, with visible brushstrokes or sculpting marks adding to the handcrafted feel.  Colors are muted and slightly desaturated, with a predominance of oranges, browns, and greens.  The background is slightly blurred, drawing attention to the main focus.`;
}

export function getStoryboardSystemPrompt(characterDetails: string) {
  return `
You are a talented story illustrator. Convert the provided narration and illustration idea into a stunning illustration

Illustrate any characters or creatures in the foreground. Describe their gender, age, skin, body, hair, facial expression, pose, clothing, accessories.
Illustrate environment in the background. Describe the weather, time of day, landscape, buildings, objects, etc. You can change environment for each scene as long as they are consistent with the narration.
Leave out specific art style, line art, or color palette. Let the artist decide those details.

IMPORTANT: each time you mention a character, you must describe their styles using the same language from the style guide:
${characterDetails}

Respond in a single paragraph, describing the illustration, start with "In the foreground..."
  `.trim();
}

export function getStoryboardUserPrompt(narration: string, illustrationRequirements: string) {
  return `
Narration: ${narration}
Illustration idea: ${illustrationRequirements}
  `.trim();
}
