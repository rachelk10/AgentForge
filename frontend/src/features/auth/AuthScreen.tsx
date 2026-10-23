import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import type { AgentState } from "../../api/contracts/auth";
import { requestPasswordRecovery, signInWithGoogle, getAgentState } from "../../shared/api/authContracts";
import { ApiError, login, registerUser } from "../../shared/api/client";
import { clearToken, saveToken } from "../../shared/auth/authStorage";
import { Button, Card, Input } from "../../shared/ui";
import { LanguageSwitcher } from "../shell/LanguageSwitcher";
import "./auth.css";

type AuthMode = "register" | "login" | "recovery";

const destinations: Record<AgentState, string> = {
  none: "/app/start",
  draft: "/app/wizard",
  published: "/dashboard",
};

function getHumanError(error: unknown, mode: AuthMode, t: (key: string) => string): string {
  if (!(error instanceof ApiError)) return t("auth.errors.generic");
  if (error.status === 401) return t("auth.errors.invalidCredentials");
  if (error.status === 400) {
    const message = error.message.toLowerCase();
    if (message.includes("email already registered")) return t("auth.errors.emailRegistered");
    if (message.includes("username already taken")) return t("auth.errors.nameRegistered");
    if (message.includes("inactive")) return t("auth.errors.inactive");
  }
  if (error.status === 404 && mode === "recovery") return t("auth.errors.recoveryUnavailable");
  return t("auth.errors.generic");
}

export function AuthScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AuthMode>("register");
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [notice, setNotice] = useState("");
  const [googleUnavailable, setGoogleUnavailable] = useState(false);
  const registerTabRef = useRef<HTMLButtonElement>(null);
  const loginTabRef = useRef<HTMLButtonElement>(null);

  const formSchema = useMemo(
    () =>
      z
        .object({
          fullName: z.string(),
          email: z.string(),
          password: z.string(),
          acceptedTerms: z.boolean(),
        })
        .superRefine((values, context) => {
          if (!z.email().safeParse(values.email.trim()).success) {
            context.addIssue({
              code: "custom",
              path: ["email"],
              message: values.email.trim() ? "invalidEmail" : "emailRequired",
            });
          }
          if (mode === "register") {
            if (values.fullName.trim().length < 3) {
              context.addIssue({ code: "custom", path: ["fullName"], message: "nameRequired" });
            } else if (values.fullName.trim().length > 100) {
              context.addIssue({ code: "custom", path: ["fullName"], message: "nameTooLong" });
            }
            if (values.password.length < 8) {
              context.addIssue({ code: "custom", path: ["password"], message: "passwordTooShort" });
            }
            if (!values.acceptedTerms) {
              context.addIssue({ code: "custom", path: ["acceptedTerms"], message: "termsRequired" });
            }
          } else if (mode === "login" && !values.password) {
            context.addIssue({ code: "custom", path: ["password"], message: "passwordRequired" });
          }
        }),
    [mode],
  );

  type AuthForm = z.infer<typeof formSchema>;
  const form = useForm<AuthForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      acceptedTerms: false,
    },
    mode: "onTouched",
  });
  useWatch({ control: form.control, name: "fullName" });
  useWatch({ control: form.control, name: "email" });
  const password = useWatch({ control: form.control, name: "password" });
  const passwordStrength = [
    password.length >= 8,
    /[A-Z]/.test(password) && /[a-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  const authMutation = useMutation({
    mutationFn: async (values: AuthForm) => {
      if (mode === "recovery") {
        await requestPasswordRecovery(values.email.trim());
        return { kind: "recovery" as const };
      }

      if (mode === "register") {
        await registerUser({
          email: values.email.trim(),
          username: values.fullName.trim(),
          password: values.password,
        });
      }

      const token = await login(values.email.trim(), values.password);
      return { kind: "authenticated" as const, accessToken: token.access_token };
    },
    onSuccess: async (result) => {
      setSubmitError("");
      if (result.kind === "recovery") {
        setNotice(t("auth.recoveryAccepted"));
        return;
      }
      await finishSignIn(result.accessToken);
    },
    onError: (error) => {
      setNotice("");
      setSubmitError(getHumanError(error, mode, t));
    },
  });

  async function finishSignIn(accessToken: string) {
    saveToken(accessToken);
    queryClient.removeQueries({ queryKey: ["admin-access"] });
    window.dispatchEvent(new Event("auth-changed"));
    try {
      const state = await getAgentState(accessToken);
      navigate(destinations[state], { replace: true });
    } catch (error) {
      clearToken();
      setSubmitError(getHumanError(error, mode, t));
    }
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setSubmitError("");
    setNotice("");
    form.clearErrors();
    void form.trigger();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const forwardKey = document.documentElement.dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backwardKey = document.documentElement.dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (event.key === forwardKey || event.key === "End") {
      event.preventDefault();
      changeMode("login");
      loginTabRef.current?.focus();
    } else if (event.key === backwardKey || event.key === "Home") {
      event.preventDefault();
      changeMode("register");
      registerTabRef.current?.focus();
    }
  }

  async function continueWithGoogle() {
    setGoogleUnavailable(false);
    setSubmitError("");
    if (!import.meta.env.DEV) {
      setGoogleUnavailable(true);
      return;
    }
    try {
      const response = await signInWithGoogle("development-mock-google-credential");
      await finishSignIn(response.access_token);
    } catch (error) {
      setSubmitError(getHumanError(error, mode, t));
    }
  }

  const busy = authMutation.isPending;
  const emailError = form.formState.errors.email?.message;
  const nameError = form.formState.errors.fullName?.message;
  const passwordError = form.formState.errors.password?.message;

  return (
    <main className="auth-page">
      <Card className="auth-card">
        <header className="auth-card__header">
          <span className="auth-brand">{t("app.title")}</span>
          <LanguageSwitcher />
        </header>

        <div className="auth-tabs" role="tablist" aria-label={t("auth.accountAccess")}>
          <button
            ref={registerTabRef}
            type="button"
            id="auth-tab-register"
            role="tab"
            aria-selected={mode === "register"}
            aria-controls="auth-panel"
            tabIndex={mode === "register" ? 0 : -1}
            className={mode === "register" ? "auth-tabs__tab is-selected" : "auth-tabs__tab"}
            onKeyDown={handleTabKeyDown}
            onClick={() => changeMode("register")}
          >
            {t("auth.registerTab")}
          </button>
          <button
            ref={loginTabRef}
            type="button"
            id="auth-tab-login"
            role="tab"
            aria-selected={mode !== "register"}
            aria-controls="auth-panel"
            tabIndex={mode !== "register" ? 0 : -1}
            className={mode !== "register" ? "auth-tabs__tab is-selected" : "auth-tabs__tab"}
            onKeyDown={handleTabKeyDown}
            onClick={() => changeMode("login")}
          >
            {t("auth.loginTab")}
          </button>
        </div>

        <div
          id="auth-panel"
          role="tabpanel"
          aria-labelledby={mode === "register" ? "auth-tab-register" : "auth-tab-login"}
        >
        <h1 className="auth-title">
          {mode === "register" ? t("auth.registerTitle") : mode === "login" ? t("auth.loginTitle") : t("auth.recoveryTitle")}
        </h1>
        <p className="auth-description">
          {mode === "register" ? t("auth.registerDescription") : mode === "login" ? t("auth.loginDescription") : t("auth.recoveryDescription")}
        </p>

        <form
          className="auth-form"
          noValidate
          onSubmit={form.handleSubmit((values) => authMutation.mutate(values))}
        >
          {mode === "register" && (
            <div className="auth-field">
              <label htmlFor="full-name">{t("auth.fullName")}</label>
              <Input
                id="full-name"
                autoComplete="name"
                {...form.register("fullName")}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? "full-name-error" : undefined}
              />
              {nameError && <p className="auth-field__error" id="full-name-error">{t(`auth.validation.${nameError}`)}</p>}
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="email">{t("auth.email")}</label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...form.register("email")}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            {emailError && <p className="auth-field__error" id="email-error">{t(`auth.validation.${emailError}`)}</p>}
          </div>

          {mode !== "recovery" && (
            <div className="auth-field">
              <label htmlFor="password">{t("auth.password")}</label>
              <div className="auth-password">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  {...form.register("password")}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={mode === "register" ? "password-strength password-error" : "password-error"}
                />
                <button
                  type="button"
                  className="auth-password__toggle"
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                </button>
              </div>
              {mode === "register" && (
                <div id="password-strength" className="auth-strength" aria-live="polite">
                  <span className="auth-strength__label">{t("auth.passwordStrength")}</span>
                  <span className={`auth-strength__value strength-${passwordStrength}`}>
                    {t(`auth.strength.${passwordStrength}`)}
                  </span>
                </div>
              )}
              {passwordError && <p className="auth-field__error" id="password-error">{t(`auth.validation.${passwordError}`)}</p>}
            </div>
          )}

          {mode === "register" && (
            <div className="auth-terms">
              <input
                id="accepted-terms"
                type="checkbox"
                {...form.register("acceptedTerms")}
                aria-invalid={Boolean(form.formState.errors.acceptedTerms)}
                aria-describedby={form.formState.errors.acceptedTerms ? "terms-error" : undefined}
              />
              <label htmlFor="accepted-terms">{t("auth.acceptTerms")}</label>
              {form.formState.errors.acceptedTerms?.message && (
                <p className="auth-field__error" id="terms-error">
                  {t(`auth.validation.${form.formState.errors.acceptedTerms.message}`)}
                </p>
              )}
            </div>
          )}

          {submitError && <p className="auth-alert auth-alert--error" role="alert">{submitError}</p>}
          {notice && <p className="auth-alert auth-alert--success" role="status">{notice}</p>}
          {googleUnavailable && <p className="auth-alert" role="status">{t("auth.googleUnavailable")}</p>}

          <Button type="submit" className="auth-submit" disabled={busy}>
            {busy
              ? t("auth.pleaseWait")
              : mode === "register"
                ? t("auth.createAccount")
                : mode === "login"
                  ? t("auth.loginAction")
                  : t("auth.sendRecovery")}
          </Button>
        </form>

        {mode === "login" && (
          <button type="button" className="auth-link" onClick={() => changeMode("recovery")}>
            {t("auth.forgotPassword")}
          </button>
        )}
        {mode === "recovery" && (
          <button type="button" className="auth-link" onClick={() => changeMode("login")}>
            {t("auth.backToLogin")}
          </button>
        )}

        {mode !== "recovery" && (
          <>
            <div className="auth-divider"><span>{t("auth.or")}</span></div>
            <Button type="button" className="auth-google" onClick={() => void continueWithGoogle()}>
              {t("auth.continueWithGoogle")}
            </Button>
          </>
        )}

        {mode === "register" && <p className="auth-privacy">{t("auth.privacyNotice")}</p>}
        </div>
      </Card>
    </main>
  );
}
