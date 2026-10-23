import { classifyAction } from "./actions";
import { RouteButton } from "./route-button";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ completed?: string }>;
}) {
  const { completed } = await searchParams;
  return (
    <>
      <p className="eyebrow">Next.js · sample-only</p>
      <h1>One inspector. Three server entry points.</h1>
      <p>
        Run a sample, then open Jev DevTools to see its context, question, and
        returned distribution. No API key or inference call is used.
      </p>
      <section>
        <h2>Route handler</h2>
        <RouteButton />
      </section>
      <section>
        <h2>Server Action</h2>
        <form action={classifyAction}>
          <button>Run server action</button>
        </form>
        {completed === "action" && (
          <p role="status">
            Server Action completed. Open the inspector to see the request.
          </p>
        )}
      </section>
      <section>
        <h2>Server Component</h2>
        <a href="/server">Render a server-side result →</a>
      </section>
    </>
  );
}
