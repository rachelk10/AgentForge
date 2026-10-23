export type AgentState = "none" | "draft" | "published";

export type GoogleAuthRequest = {
  credential: string;
};

export type GoogleAuthResponse = {
  access_token: string;
  token_type: "bearer";
};

export type PasswordRecoveryRequest = {
  email: string;
};

export type PasswordRecoveryResponse = {
  accepted: true;
};

export const authContractPaths = {
  google: "/auth/google",
  passwordRecovery: "/auth/password-recovery",
  agentState: "/account/agent-state",
} as const;
