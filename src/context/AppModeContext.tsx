'use client';

import { createContext, useContext } from 'react';

const AppModeContext = createContext({ demoEnabled: false });
export function AppModeProvider({ demoEnabled, children }: { demoEnabled: boolean; children: React.ReactNode }) {
  return <AppModeContext.Provider value={{ demoEnabled }}>{children}</AppModeContext.Provider>;
}
export function useAppMode() { return useContext(AppModeContext); }
