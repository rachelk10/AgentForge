import type {
  AgentState,
  GoogleAuthRequest,
  GoogleAuthResponse,
  PasswordRecoveryRequest,
  PasswordRecoveryResponse,
} from "../../api/contracts/auth";
import { apiFetch } from "./client";
import { authContractPaths } from "../../api/contracts/auth";

export function signInWithGoogle(credential: string): Promise<GoogleAuthResponse> {
  const body: GoogleAuthRequest = { credential };
  return apiFetch<GoogleAuthResponse>(authContractPaths.google, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function requestPasswordRecovery(email: string): Promise<PasswordRecoveryResponse> {
  const body: PasswordRecoveryRequest = { email };
  return apiFetch<PasswordRecoveryResponse>(authContractPaths.passwordRecovery, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getAgentState(token: string): Promise<AgentState> {
  return apiFetch<unknown>(authContractPaths.agentState, { token }).then((state) => {
    if (state === "none" || state === "draft" || state === "published") return state;
    throw new Error("The account state response is invalid.");
  });
}
