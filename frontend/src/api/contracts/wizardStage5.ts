export type AgentAppearance = {
  primary_color: string;
  logo_data: string | null;
  is_published: boolean;
  public_key: string | null;
};

export type AgentAppearanceSettings = Pick<AgentAppearance, "primary_color" | "is_published" | "public_key">;

export type ChatMessage = {
  id: string;
  role: string;
  content: string;
};

export type ChatReply = {
  conversation_id: string;
  message: ChatMessage;
};

export type PublishResult = {
  public_key: string;
  published_at: string;
};
