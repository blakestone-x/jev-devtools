/** @type {import('next').NextConfig} */
export default {
  // Externalize only the Node SDK. Keep the mixed React/Node DevTools package
  // bundled so its client entry uses Next's React instance during SSR.
  serverExternalPackages: ["@typesafe-ai/sdk"],
};
