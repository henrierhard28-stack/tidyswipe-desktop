import { createFileRoute } from "@tanstack/react-router";
import App from "@/desktop/App";

export const Route = createFileRoute("/")({
  component: App,
  head: () => ({
    meta: [
      { title: "TidySwipe for Mac" },
      { name: "description", content: "Allégez votre Mac, fichier par fichier." },
    ],
  }),
});
