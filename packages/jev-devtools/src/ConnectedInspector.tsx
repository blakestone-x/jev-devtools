import { useEffect, useState } from "react";
import { JevPanel } from "./JevDevtools.js";
import { JevDrawer } from "./JevDrawer.js";
import type { Snapshot, Trace } from "./protocol.js";
import type { JevDevtoolsProps } from "./index.js";
function endpointUrl(endpoint: string) {
  const url = new URL(endpoint, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use a same-origin inspector endpoint without a query or fragment.",
    );
  return url.href.replace(/\/$/, "");
}
export default function ConnectedInspector({
  endpoint = "/api/jev-devtools",
  defaultOpen = true,
}: Omit<JevDevtoolsProps, "enabled">) {
  const [traces, setTraces] = useState<Trace[]>([]),
    [connection, setConnection] = useState("connecting");
  useEffect(() => {
    let alive = true,
      events: EventSource | undefined;
    const abort = new AbortController();
    setTraces([]);
    setConnection("connecting");
    void (async () => {
      try {
        const url = endpointUrl(endpoint);
        const response = await fetch(url, {
          signal: abort.signal,
          credentials: "same-origin",
        });
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "Inspector disabled or endpoint missing"
              : `Inspector unavailable (${response.status})`,
          );
        const config = await response.json();
        if (config.version !== 1 || !config.enabled)
          throw new Error("Unsupported inspector endpoint");
        if (!alive) return;
        events = new EventSource(url + "/events");
        events.addEventListener("snapshot", (event) => {
          if (!alive) return;
          try {
            const data = JSON.parse((event as MessageEvent).data) as Snapshot;
            if (data.version !== 1 || !Array.isArray(data.traces))
              throw new Error();
            setTraces(data.traces);
            setConnection("connected");
          } catch {
            setConnection("Invalid inspector update");
          }
        });
        events.onerror = () => {
          if (alive) setConnection("reconnecting");
        };
      } catch (error) {
        if (alive)
          setConnection(
            error instanceof Error ? error.message : "Inspector unavailable",
          );
      }
    })();
    return () => {
      alive = false;
      abort.abort();
      events?.close();
    };
  }, [endpoint]);
  async function clear() {
    const response = await fetch(endpointUrl(endpoint) + "/clear", {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!response.ok)
      throw new Error(`Cannot clear history (${response.status})`);
  }
  return (
    <JevDrawer defaultOpen={defaultOpen}>
      <JevPanel traces={traces} connection={connection} onClear={clear} />
    </JevDrawer>
  );
}
