import { beforeEach, describe, expect, it } from "vitest";
import { mountWidget } from "./loader";

describe("widget loader", () => {
  beforeEach(() => {
    document.querySelectorAll("iframe").forEach((iframe) => iframe.remove());
    document.documentElement.lang = "en";
    document.documentElement.dir = "";
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  });

  it("adds a direction-aware iframe without changing the host document", () => {
    document.documentElement.lang = "he";
    const script = document.createElement("script");
    script.src = "https://chat.example/widget.js";
    script.dataset.publicKey = "public key";
    const originalTitle = document.title;

    const iframe = mountWidget(document, script);

    expect(iframe).not.toBeNull();
    const url = new URL(iframe?.src ?? "");
    expect(url.origin + url.pathname).toBe("https://chat.example/packages/widget/widget.html");
    expect(url.searchParams.get("publicKey")).toBe("public key");
    expect(url.searchParams.get("mode")).toBe("widget");
    expect(url.searchParams.get("lang")).toBe("he");
    expect(url.searchParams.get("dir")).toBe("rtl");
    expect(url.searchParams.get("parentOrigin")).toBe(window.location.origin);
    expect(iframe?.dir).toBe("rtl");
    expect(iframe?.title).toBe("שיחה עם העסק");
    expect(document.title).toBe(originalTitle);
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("resizes only in response to a message from its own frame", () => {
    document.documentElement.lang = "en";
    const script = document.createElement("script");
    script.src = "https://chat.example/widget.js";
    script.dataset.publicKey = "public-demo";
    const iframe = mountWidget(document, script);
    if (!iframe) throw new Error("Widget iframe was not created");

    window.dispatchEvent(new MessageEvent("message", {
      data: { type: "agent-widget:resize", isOpen: true },
      origin: "https://chat.example",
      source: window,
    }));
    expect(iframe.style.inlineSize).toBe("4.5rem");

    window.dispatchEvent(new MessageEvent("message", {
      data: { type: "agent-widget:resize", isOpen: true },
      origin: "https://chat.example",
      source: iframe.contentWindow,
    }));
    expect(iframe.style.inlineSize).toContain("26rem");
  });

  it("uses the full viewport for an open mobile chat", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const script = document.createElement("script");
    script.src = "https://chat.example/packages/widget/widget.js";
    script.dataset.publicKey = "public-demo";
    const iframe = mountWidget(document, script);
    if (!iframe) throw new Error("Widget iframe was not created");

    window.dispatchEvent(new MessageEvent("message", {
      data: { type: "agent-widget:resize", isOpen: true },
      origin: "https://chat.example",
      source: iframe.contentWindow,
    }));

    expect(iframe.style.inlineSize).toBe("100vw");
    expect(iframe.style.blockSize).toBe("100dvh");
  });

  it("does not inject an iframe without a public key or inject twice", () => {
    const script = document.createElement("script");
    script.src = "https://chat.example/widget.js";
    expect(mountWidget(document, script)).toBeNull();

    const keyedScript = document.createElement("script");
    keyedScript.src = "https://chat.example/widget.js";
    keyedScript.dataset.publicKey = "public-demo";
    expect(mountWidget(document, keyedScript)).not.toBeNull();
    expect(mountWidget(document, keyedScript)).toBeNull();
  });
});
