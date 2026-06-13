import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import es from "./locales/es.json";

if (!i18n.isInitialized) {
  const instance = i18n.use(initReactI18next);

  // LanguageDetector only works in the browser (needs navigator / localStorage)
  if (typeof window !== "undefined") {
    instance.use(LanguageDetector);
  }

  instance.init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    lng:           typeof window === "undefined" ? "en" : undefined,
    fallbackLng:   "en",
    initImmediate: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ["navigator"],
    },
  });
}

export default i18n;
