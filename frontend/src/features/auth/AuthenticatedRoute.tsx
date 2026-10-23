import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getCurrentUser } from "../../shared/api/client";
import { getToken } from "../../shared/auth/authStorage";
import { useTranslation } from "react-i18next";
import { Skeleton } from "../../shared/ui";

export function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const token = getToken();
  const userQuery = useQuery({
    queryKey: ["current-user", token],
    queryFn: () => getCurrentUser(token!),
    enabled: Boolean(token),
    retry: false,
  });

  if (!token) return <Navigate to="/" replace />;
  if (userQuery.isPending) return <Skeleton aria-label={t("app.checkingAccess")} />;
  if (userQuery.isError) return <Navigate to="/" replace />;
  return children;
}
