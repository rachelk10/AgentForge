import en from "./locales/en.json";
import he from "./locales/he.json";

const CLOSED_SIZE = "4.5rem";
const OPEN_WIDTH = "min(26rem, calc(100vw - 2rem))";
const OPEN_HEIGHT = "min(44rem, calc(100dvh - 2rem))";
const MOBILE_BREAKPOINT = 640;

function isSupportedLanguage(language: string): language is "he" | "en" {
  return language === "he" || language === "en";
}

function hostLanguage(hostDocument: Document): "he" | "en" {
  const pageLanguage = hostDocument.documentElement.lang.toLowerCase().split("-")[0];
  if (isSupportedLanguage(pageLanguage)) return pageLanguage;
  return navigator.language.toLowerCase().startsWith("he") ? "he" : "en";
}

export function mountWidget(
  hostDocument: Document = document,
  script: HTMLScriptElement | null = hostDocument.currentScript as HTMLScriptElement | null,
) {
  if (!script || script.dataset.agentForgeWidgetLoaded === "true") return null;
  const publicKey = script.dataset.publicKey?.trim();
  if (!publicKey) {
    console.error("AgentForge widget: missing data-public-key.");
    return null;
  }

  script.dataset.agentForgeWidgetLoaded = "true";
  const scriptUrl = new URL(script.src, hostDocument.baseURI);
  const language = hostLanguage(hostDocument);
  const hostDirection = hostDocument.documentElement.dir === "rtl" || hostDocument.documentElement.dir === "ltr"
    ? hostDocument.documentElement.dir
    : language === "he" ? "rtl" : "ltr";
  const widgetUrl = new URL("/packages/widget/widget.html", scriptUrl.origin);
  widgetUrl.searchParams.set("publicKey", publicKey);
  widgetUrl.searchParams.set("mode", "widget");
  widgetUrl.searchParams.set("lang", language);
  widgetUrl.searchParams.set("dir", hostDirection);
  widgetUrl.searchParams.set("parentOrigin", hostDocument.location.origin);

  const iframe = hostDocument.createElement("iframe");
  iframe.src = widgetUrl.toString();
  iframe.title = language === "he" ? he.chatTitle : en.chatTitle;
  iframe.dir = hostDirection;
  iframe.setAttribute("allow", "clipboard-write");
  iframe.style.position = "fixed";
  iframe.style.zIndex = "2147483000";
  iframe.style.border = "0";
  iframe.style.background = "transparent";
  iframe.style.insetBlockEnd = "1rem";
  iframe.style.insetInlineEnd = "1rem";
  iframe.style.inlineSize = CLOSED_SIZE;
  iframe.style.blockSize = CLOSED_SIZE;
  iframe.style.colorScheme = "light";

  const applySize = (isOpen: boolean) => {
    if (isOpen && hostDocument.defaultView && hostDocument.defaultView.innerWidth <= MOBILE_BREAKPOINT) {
      iframe.style.inset = "0";
      iframe.style.inlineSize = "100vw";
      iframe.style.blockSize = "100dvh";
      return;
    }

    iframe.style.inset = "auto";
    iframe.style.insetBlockEnd = "1rem";
    iframe.style.insetInlineEnd = "1rem";
    iframe.style.inlineSize = isOpen ? OPEN_WIDTH : CLOSED_SIZE;
    iframe.style.blockSize = isOpen ? OPEN_HEIGHT : CLOSED_SIZE;
  };

  const view = hostDocument.defaultView;
  const handleWidgetMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow || event.origin !== widgetUrl.origin) return;
    if (typeof event.data !== "object" || event.data === null || event.data.type !== "agent-widget:resize") return;
    applySize(event.data.isOpen === true);
  };
  view?.addEventListener("message", handleWidgetMessage);
  view?.addEventListener("resize", () => {
    if (iframe.style.blockSize !== CLOSED_SIZE) applySize(true);
  });
  (hostDocument.body ?? hostDocument.documentElement).append(iframe);

  return iframe;
}

if (typeof document !== "undefined") {
  const loaderScript = document.currentScript as HTMLScriptElement | null
    ?? Array.from(document.scripts).find((candidate) =>
      candidate.dataset.publicKey && /\/(?:widget\.js|loader\.ts)$/.test(new URL(candidate.src).pathname),
    )
    ?? null;
  mountWidget(document, loaderScript);
}
