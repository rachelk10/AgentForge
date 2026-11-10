export type PublicLanguage = "he" | "en";

export type PublicAgentProfile = {
  public_key: string;
  agent_name: string;
  opening_message: string;
  language: PublicLanguage;
  primary_color: string;
  logo_data: string | null;
  is_active: boolean;
  paused_message: string | null;
};

export type PublicChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type PublicLeadField = {
  id: string;
  label: string;
  type: "text" | "email" | "tel";
  required: boolean;
};

export type PublicChatInteraction =
  | {
      type: "lead_collection";
      fields: PublicLeadField[];
    }
  | {
      type: "meeting_slots";
      prompt: string;
      slots: Array<{ id: string; label: string }>;
    }
  | {
      type: "handoff";
      prompt: string;
      contact_methods: Array<{ id: "email" | "phone"; label: string }>;
    };

export type PublicChatActionResponse =
  | { type: "lead_collection"; values: Record<string, string> }
  | { type: "meeting_slots"; slot_id: string; values: { name: string; email: string } }
  | { type: "handoff"; contact_preference: "email" | "phone"; contact_details: string };

export type PublicChatRequest = {
  message?: string;
  conversation_id?: string;
  language: PublicLanguage;
  action_response?: PublicChatActionResponse;
};

export type PublicChatReply = {
  conversation_id: string;
  message: PublicChatMessage;
  interaction: PublicChatInteraction | null;
};

export const publicAgentPath = (publicKey: string) =>
  `/public/agents/${encodeURIComponent(publicKey)}`;
