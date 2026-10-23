import { z } from "zod";
import { conversationLanguages, industryOptions, toneOptions } from "../../api/contracts/wizardDraft";

export const businessSchema = z
  .object({
    businessName: z.string().trim().min(1, "businessNameRequired").max(100, "businessNameTooLong"),
    industry: z.string().min(1, "industryRequired").pipe(z.enum(industryOptions, "industryRequired")),
    industryOther: z.string().trim().max(100, "industryOtherTooLong"),
    businessDescription: z.string().trim().min(1, "descriptionRequired").max(1000, "descriptionTooLong"),
    agentName: z.string().trim().min(1, "agentNameRequired").max(60, "agentNameTooLong"),
    openingMessage: z.string().trim().min(1, "openingMessageRequired").max(300, "openingMessageTooLong"),
    language: z.enum(conversationLanguages),
    tone: z.enum(toneOptions),
    guidelines: z.string().trim().max(1000, "guidelinesTooLong"),
  })
  .superRefine((values, context) => {
    if (values.industry === "other" && !values.industryOther) {
      context.addIssue({ code: "custom", path: ["industryOther"], message: "industryOtherRequired" });
    }
  });
