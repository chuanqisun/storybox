export function message(role: "assistant" | "user" | "system") {
  return function taggedLiteral(templates: TemplateStringsArray, ...args: any[]) {
    return {
      role,
      content: String.raw({ raw: templates.raw }, ...args).trim(),
    };
  };
}

export function assistant(templates: TemplateStringsArray, ...args: any[]) {
  return {
    role: "assistant" as const,
    content: String.raw({ raw: templates.raw }, ...args).trim(),
  };
}

export function user(templates: TemplateStringsArray, ...args: any[]) {
  return {
    role: "user" as const,
    content: String.raw({ raw: templates.raw }, ...args).trim(),
  };
}

export function system(templates: TemplateStringsArray, ...args: any[]) {
  return {
    role: "system" as const,
    content: String.raw({ raw: templates.raw }, ...args).trim(),
  };
}
