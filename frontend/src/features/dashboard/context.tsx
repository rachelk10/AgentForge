import { createContext, useContext, type ReactNode } from "react";
import type { Agent } from "../../shared/api/dashboard";

export type DashboardContextValue = {
  agent: Agent;
  token: string;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardContextProvider({
  agent,
  token,
  children,
}: DashboardContextValue & { children: ReactNode }) {
  return (
    <DashboardContext.Provider value={{ agent, token }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardContext(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (!context) throw new Error("Dashboard context is unavailable");
  return context;
}
