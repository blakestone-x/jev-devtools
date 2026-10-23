"use client";
import { JevDevtools } from "@diagram-motion-lab/jev-devtools";

export function Devtools() {
  return (
    <JevDevtools
      enabled={process.env.NODE_ENV === "development"}
      defaultOpen={false}
    />
  );
}
