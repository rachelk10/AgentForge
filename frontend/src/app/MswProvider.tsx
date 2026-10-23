import { useEffect, useState } from "react";

export function MswProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!import.meta.env.DEV);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let active = true;
    import("../shared/api/mocks/browser").then(({ worker }) =>
      worker.start({ onUnhandledFrame: "bypass" }).then(() => {
        if (active) setReady(true);
      }),
    );
    return () => {
      active = false;
    };
  }, []);

  return ready ? children : null;
}
