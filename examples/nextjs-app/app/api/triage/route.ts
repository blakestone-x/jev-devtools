import { classify, origin } from "../../../server/jev";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== origin)
    return new Response("Forbidden", { status: 403 });
  return Response.json({ category: await classify("Route Handler") });
}
