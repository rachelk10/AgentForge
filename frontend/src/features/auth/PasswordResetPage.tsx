import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { resetPassword } from "../../shared/api/authContracts";
import { Button, Card, Input } from "../../shared/ui";
import { LanguageSwitcher } from "../shell/LanguageSwitcher";

const resetSchema = z
  .object({
    password: z.string().min(8, "passwordTooShort"),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "passwordsDoNotMatch",
  });

type ResetForm = z.infer<typeof resetSchema>;

export function PasswordResetPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [requestError, setRequestError] = useState(false);
  const [complete, setComplete] = useState(false);
  const form = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function submit(values: ResetForm) {
    setRequestError(false);
    try {
      await resetPassword(token, values.password);
      setComplete(true);
    } catch {
      setRequestError(true);
    }
  }

  return (
    <main className="auth-page">
      <Card className="auth-card">
        <header className="auth-card__header">
          <span className="auth-brand">{t("app.title")}</span>
          <LanguageSwitcher />
        </header>
        <h1 className="auth-title">{t("auth.resetPasswordTitle")}</h1>
        {complete ? (
          <section aria-live="polite">
            <p className="auth-alert auth-alert--success" role="status">{t("auth.resetPasswordSuccess")}</p>
            <Button type="button" onClick={() => navigate("/", { replace: true })}>
              {t("auth.backToLogin")}
            </Button>
          </section>
        ) : (
          <form className="auth-form" noValidate onSubmit={form.handleSubmit(submit)}>
            <p className="auth-description">{t("auth.resetPasswordDescription")}</p>
            <div className="auth-field">
              <label htmlFor="reset-password">{t("auth.newPassword")}</label>
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                {...form.register("password")}
                aria-invalid={Boolean(form.formState.errors.password)}
              />
              {form.formState.errors.password?.message ? (
                <p className="auth-field__error" role="alert">
                  {t(`auth.validation.${form.formState.errors.password.message}`)}
                </p>
              ) : null}
            </div>
            <div className="auth-field">
              <label htmlFor="reset-confirm-password">{t("auth.confirmPassword")}</label>
              <Input
                id="reset-confirm-password"
                type="password"
                autoComplete="new-password"
                {...form.register("confirmPassword")}
                aria-invalid={Boolean(form.formState.errors.confirmPassword)}
              />
              {form.formState.errors.confirmPassword?.message ? (
                <p className="auth-field__error" role="alert">
                  {t(`auth.validation.${form.formState.errors.confirmPassword.message}`)}
                </p>
              ) : null}
            </div>
            {requestError || !token ? (
              <p className="auth-alert auth-alert--error" role="alert">{t("auth.resetPasswordError")}</p>
            ) : null}
            <Button type="submit" className="auth-submit" disabled={form.formState.isSubmitting || !token}>
              {form.formState.isSubmitting ? t("auth.pleaseWait") : t("auth.resetPasswordAction")}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
