import { useContext } from "react";
import { PlatformContext } from "./PlatformProvider";

export function usePlatform() {
  const value = useContext(PlatformContext);
  if (!value) {
    throw new Error("PlatformProvider missing");
  }

  return value;
}
