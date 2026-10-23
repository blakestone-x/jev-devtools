"use client";
import { JevDevtools } from "jev-devtools";

export function Devtools() {
  return (
    <JevDevtools
      enabled={process.env.NODE_ENV === "development"}
      defaultOpen={false}
    />
  );
}
