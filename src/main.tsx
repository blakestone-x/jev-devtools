if (import.meta.env.DEV) {
  void import("./Playground").then(({ mount }) => mount());
} else {
  document.getElementById("root")!.textContent =
    "Jev Inspector is a local development tool. Start it with npm run dev:devtools.";
}
