import type { components } from "../../api/generated/openapi";
import { clearToken } from "../auth/authStorage";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type RequestOptions = Omit<RequestInit, "headers"> & {
  token?: string;
  headers?: HeadersInit;
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers: providedHeaders, ...requestOptions } = options;
  const headers = new Headers(providedHeaders);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...requestOptions, headers });
  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new Event("auth-expired"));
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  const body: unknown = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail = typeof body === "object" && body !== null && "detail" in body
      ? String(body.detail)
      : response.statusText;
    throw new ApiError(detail || `Request failed (${response.status})`, response.status);
  }

  return body as T;
}

export type CurrentUser = components["schemas"]["UserResponse"];
export type AccessToken = components["schemas"]["Token"];
export type NewUser = components["schemas"]["UserCreate"];

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function login(email: string, password: string): Promise<AccessToken> {
  const body = new URLSearchParams({ username: email, password });
  return apiFetch<AccessToken>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

export function registerUser(user: NewUser): Promise<CurrentUser> {
  return apiFetch<CurrentUser>("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
}

export function getCurrentUser(token: string): Promise<CurrentUser> {
  return apiFetch<CurrentUser>("/auth/me", { token });
}
