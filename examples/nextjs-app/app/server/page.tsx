import { classify } from "../../server/jev";

export const dynamic = "force-dynamic";
export default async function ServerPage() {
  const category = await classify("Server Component");
  return (
    <>
      <p className="eyebrow">Server Component</p>
      <h1>Returned category: {category}</h1>
      <p>
        This result was rendered on the server. Its sample request is available
        in the same Jev DevTools history.
      </p>
      <a href="/">← Back to examples</a>
    </>
  );
}
