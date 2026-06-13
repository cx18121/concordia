// Single seam the pages import. Picks the real Dynamic provider in live mode, the
// mock otherwise (default). USE_MOCK is a build-time constant, so the chosen hook
// is stable across renders (rules of hooks hold).
import { useAuth as mockUseAuth } from "./mockAuth";
import { useAuth as liveUseAuth } from "./auth";

export const useAuth =
  process.env.NEXT_PUBLIC_USE_MOCK !== "false" ? mockUseAuth : liveUseAuth;
