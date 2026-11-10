import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

export function PublicChatRoute() {
  const { t, i18n } = useTranslation();
  const { publicKey = "" } = useParams();
  const language = i18n.resolvedLanguage?.startsWith("he") ? "he" : "en";
  const params = new URLSearchParams({ publicKey, mode: "standalone", lang: language });
  return (
    <main className="public-chat-page">
      <iframe
        className="public-chat-standalone-frame"
        src={`/packages/widget/widget.html?${params.toString()}`}
        title={t("publicChat.chatLabel")}
      />
    </main>
  );
}
