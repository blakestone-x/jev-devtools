"use client";
import { useState } from "react";

export function RouteButton() {
  const [result, setResult] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div>
      <button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            const response = await fetch("/api/triage", { method: "POST" });
            if (!response.ok) throw new Error("Sample failed");
            setResult(`Returned category: ${(await response.json()).category}`);
          } catch {
            setResult("Sample failed. Check the server.");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Running…" : "Run route handler"}
      </button>
      <p role="status">{result}</p>
    </div>
  );
}
