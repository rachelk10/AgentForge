import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { login } from "../../shared/api/client";
import { clearToken, saveToken } from "../../shared/auth/authStorage";
import { isAdmin } from "../../shared/auth/isAdmin";
import { Button, Card, Input } from "../../shared/ui";
import { LanguageSwitcher } from "../shell/LanguageSwitcher";

export function AdminAccess() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      saveToken(result.access_token);
      const admin = await queryClient.fetchQuery({
        queryKey: ["admin-access", result.access_token],
        queryFn: () => isAdmin(result.access_token),
        retry: false,
      });
      if (!admin) {
        clearToken();
        navigate("/admin/denied", { replace: true });
        return;
      }
      navigate("/admin", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("app.accessDeniedDescription"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="stage-shell">
      <Card className="stage-card admin-access">
        <header className="stage-shell__header">
          <LanguageSwitcher />
        </header>
        <h1>{t("app.adminLoginTitle")}</h1>
        <form className="admin-access__form" onSubmit={submit}>
          <label>
            {t("app.email")}
            <Input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            {t("app.password")}
            <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error && <p role="alert" className="admin-access__error">{error}</p>}
          <Button type="submit" disabled={isSubmitting}>{t("app.signIn")}</Button>
        </form>
      </Card>
    </main>
  );
}
