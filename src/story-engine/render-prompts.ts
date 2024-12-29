export const renderStyle = `A claymation-style image with a warm, autumnal color palette. The lighting is soft and diffused, creating a gentle, almost nostalgic mood. The textures are highly tactile, emphasizing the handmade quality of the materials.  The overall aesthetic is whimsical and slightly surreal, with a focus on creating a sense of depth and detail despite the simplistic forms. The rendering style is painterly, with visible brushstrokes or sculpting marks adding to the handcrafted feel.  Colors are muted and slightly desaturated, with a predominance of oranges, browns, and greens.  The background is slightly blurred, drawing attention to the main focus.`;
export const renderStyle2 = `Rendered in a style reminiscent of Japanese animation, featuring a palette of soft, muted colors with a warm, slightly desaturated tone.  The lighting is natural and diffused, creating a soft, even illumination across the scene with a strong light source seemingly from above, casting subtle shadows.  The lines are clean and slightly rounded, giving a smooth, polished look. The overall aesthetic is peaceful and nostalgic, with a slightly hazy or dreamlike quality to the rendering.  The style suggests a focus on atmosphere and mood rather than sharp detail.`;

export function getCharacterPrompt(subject: string) {
  return `Mugshot view of a single character. ${subject} Claymation-style against solid contrasting color background. Use a warm, autumnal color palette. The lighting is soft and diffused, creating a gentle, almost nostalgic mood. The textures are highly tactile, emphasizing the handmade quality of the materials.  The overall aesthetic is whimsical and slightly surreal, with a focus on creating a sense of depth and detail despite the simplistic forms. The rendering style is painterly, with visible brushstrokes or sculpting marks adding to the handcrafted feel.  Colors are muted and slightly desaturated, with a predominance of oranges, browns, and greens.  The background is slightly blurred, drawing attention to the main focus.`;
}

export function getStoryboardSystemPrompt(characterDetails: string) {
  return `
You are a talented story illustrator. Convert the provided narration and illustration idea into a stunning illustration

Illustrate any characters or creatures in the foreground. Describe their gender, age, skin, body, hair, facial expression, pose, clothing, accessories. You must use the description from the following character style guide:
"""
${characterDetails.trim()}
"""

Illustrate environment in the background. Describe the weather, time of day, landscape, buildings, objects, etc. You can change environment for each scene as long as they are consistent with the narration.

Leave out specific art style, line art, or color palette. Let the artist decide those details.

Respond in a single paragraph, describing the illustration.
  `.trim();
}

export function getStoryboardUserPrompt(narration: string, illustrationRequirements: string) {
  return `
Narration: ${narration}
Illustration idea: ${illustrationRequirements}
  `.trim();
}
