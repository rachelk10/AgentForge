import { getCurrentUser } from "../api/client";

export async function isAdmin(token: string): Promise<boolean> {
  const user = await getCurrentUser(token);
  return user.is_admin;
}
