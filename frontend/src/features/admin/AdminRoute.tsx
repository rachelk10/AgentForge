import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { isAdmin } from "../../shared/auth/isAdmin";
import { getToken } from "../../shared/auth/authStorage";
import { useTranslation } from "react-i18next";
import { Button, Card, Skeleton } from "../../shared/ui";
import { LanguageSwitcher } from "../shell/LanguageSwitcher";

export function AdminDenied() {
  const { t } = useTranslation();
  return (
    <main className="stage-shell">
      <Card className="stage-card">
        <LanguageSwitcher />
        <h1>{t("app.accessDeniedTitle")}</h1>
        <p role="alert">{t("app.accessDeniedDescription")}</p>
      </Card>
    </main>
  );
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const token = getToken();
  const adminQuery = useQuery({
    queryKey: ["admin-access", token],
    queryFn: () => isAdmin(token!),
    enabled: Boolean(token),
    retry: false,
  });

  if (!token) return <Navigate to="/admin/login" replace />;
  if (adminQuery.isPending) {
    return <Skeleton aria-label={t("app.checkingAccess")} />;
  }
  if (adminQuery.isError) {
    return (
      <main className="stage-shell">
        <Card className="stage-card">
          <LanguageSwitcher />
          <h1>{t("app.accessDeniedTitle")}</h1>
          <p role="alert">{t("app.accessCheckError")}</p>
          <Button type="button" onClick={() => void adminQuery.refetch()}>{t("app.retry")}</Button>
        </Card>
      </main>
    );
  }
  if (!adminQuery.data) return <Navigate to="/admin/denied" replace />;
  return children;
}
