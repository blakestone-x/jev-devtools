import { defineConfig } from "vite";
import { createJevDevtools } from "@diagram-motion-lab/jev-devtools/server";
export default defineConfig({
  server: { host: "127.0.0.1", port: 4183, strictPort: true },
  plugins: [
    {
      name: "sample-jev-server",
      configureServer(server) {
        const inspector = createJevDevtools({
          enabled: true,
          origin: "http://127.0.0.1:4183",
          endpoint: "/inspect",
        });
        const jev = inspector.createClient(
          {
            apiKey: "sample-only",
            logLevel: "off",
            fetch: async () =>
              Response.json({
                model: "jev-sample",
                answers: {
                  category: {
                    type: "choice",
                    choice: "billing",
                    probabilities: {
                      billing: 0.76,
                      delivery: 0.14,
                      other: 0.1,
                    },
                    confidence: 0.64,
                  },
                },
              }),
          },
          { label: "Consumer ticket", source: "sample" },
        );
        server.httpServer.once("close", () => inspector.dispose());
        server.middlewares.use(inspector.middleware);
        server.middlewares.use(async (req, res, next) => {
          if (req.url !== "/__demo/run" || req.method !== "POST") return next();
          try {
            await jev.systemOne({
              state: {
                message:
                  "I was charged twice. Please help with the extra payment.",
              },
              questions: {
                category: {
                  type: "choice",
                  instructions: "Which team should handle this message?",
                  criteria: {
                    billing: "Payment issues",
                    delivery: "Shipping issues",
                    other: "Everything else",
                  },
                },
              },
            });
            res
              .writeHead(200, { "content-type": "application/json" })
              .end('{"ok":true}');
          } catch {
            res.writeHead(500).end("Sample failed");
          }
        });
      },
    },
    {
      name: "verify-client-boundary",
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle))
          if (output.type === "chunk")
            for (const id of Object.keys(output.modules))
              if (
                id.includes("/lib/server/") ||
                id.includes("/@typesafe-ai/sdk/")
              )
                throw new Error(`Server module in browser bundle: ${id}`);
      },
    },
  ],
});
