import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nextProvider } from "react-i18next";
import { i18n } from "../i18n";
import { Button, Card, Dialog, Input, Skeleton, Toast } from "./index";
import { LanguageSwitcher } from "../../features/shell/LanguageSwitcher";
import { LanguageProvider } from "../../app/LanguageProvider";

describe("base accessible components", () => {
  it("renders labeled controls, status, skeleton and dialog", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <>
          <label htmlFor="business-name">Business name</label>
          <Input id="business-name" />
          <Button>Continue</Button>
          <Card aria-label="Content card">Card content</Card>
          <Skeleton aria-label="Loading content" />
          <Toast onDismiss={() => undefined}>Saved</Toast>
          <Dialog open titleId="dialog-title" onClose={() => undefined}>
            <h2 id="dialog-title">Confirm</h2>
          </Dialog>
        </>
      </I18nextProvider>,
    );

    expect(screen.getByLabelText("Business name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Content card" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByRole("dialog", { name: "Confirm" })).toBeInTheDocument();
    expect(document.querySelector(".skeleton")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("language direction", () => {
  it("switches document language and direction between Hebrew and English", async () => {
    await i18n.changeLanguage("en");
    render(
      <LanguageProvider>
        <LanguageSwitcher />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    expect(document.documentElement.lang).toBe("he");
    expect(document.documentElement.dir).toBe("rtl");

    fireEvent.click(screen.getByRole("button", { name: "שפה" }));
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
  });
});
