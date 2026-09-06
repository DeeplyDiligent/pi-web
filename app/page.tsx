import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { I18nProvider } from "@/hooks/useI18n";

export default function Home() {
  return (
    <Suspense>
      <I18nProvider>
        <AuthGate />
      </I18nProvider>
    </Suspense>
  );
}
