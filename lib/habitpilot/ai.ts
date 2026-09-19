import { z } from "zod";
import {
  Draft,
  State,
  draftSchema,
  localDate,
  fallbackSuggestion,
} from "./core";
export const aiRequest = z.object({
  kind: z.enum(["draft", "breakdown", "review", "coach"]),
  prompt: z.string().trim().max(1200).default(""),
  ids: z.array(z.string().uuid()).max(100).default([]),
});
export const aiResponse = z.object({
  message: z.string().max(1800),
  drafts: z.array(draftSchema).max(4).default([]),
});
export function ruleResponse(kind: string, prompt: string, s: State) {
  const text = prompt.toLowerCase();
  const unsafe =
    /\b(fast(?:ing)?|calori\w*|weight loss|lose weight|starv\w*|alcohol|gambl\w*|smok\w*|vaping|dangerous challenge)\b/i.test(
      text,
    );
  if (unsafe)
    return {
      message:
        "Let’s choose a safe, sustainable habit such as reading, learning, journaling, or a comfortable walk. I can help make it small and practical.",
      drafts: [],
      source: "Rule-based" as const,
    };
  const days = /weekday/.test(text)
    ? [1, 2, 3, 4, 5]
    : /weekend/.test(text)
      ? [0, 6]
      : [0, 1, 2, 3, 4, 5, 6];
  const n = Number(text.match(/\b(\d+)\b/)?.[1] || 10);
  const base = {
    description: "Start small and adjust after a week.",
    start: localDate(s.profile.timezone),
    days,
  };
  const draft: Draft = {
    ...base,
    name: /java/.test(text)
      ? "Practise Java"
      : /cod|program/.test(text)
        ? "Practise coding"
        : /read/.test(text)
          ? "Read a few pages"
          : /walk/.test(text)
            ? "Go for a walk"
            : /journal/.test(text)
              ? "Write in my journal"
              : prompt.slice(0, 80) || "Work on my goal",
    category: /walk/.test(text) ? "Wellbeing" : "Learning",
    type: /journal/.test(text) ? "boolean" : "quantity",
    target: Math.max(1, Math.min(n, 10000)),
    unit: /read/.test(text) ? "pages" : "minutes",
  };
  return {
    message:
      kind === "draft"
        ? "Here’s a starting point. Review the name, target, and days before adding it."
        : kind === "breakdown"
          ? "Start with these two small habits. Review each draft and add only what fits your day."
          : fallbackSuggestion(s),
    drafts:
      kind === "draft"
        ? [draft]
        : kind === "breakdown"
          ? [
              {
                ...draft,
                name: "Practise: " + (prompt.slice(0, 55) || "my goal"),
                target: 10,
              },
              {
                ...base,
                name: "Review what I learned",
                category: "Mindfulness" as const,
                type: "boolean" as const,
                target: 1,
                unit: "",
              },
            ]
          : [],
    source: "Rule-based" as const,
  };
}
