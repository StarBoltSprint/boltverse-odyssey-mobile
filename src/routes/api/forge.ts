import { createFileRoute } from "@tanstack/react-router";
import { handleForge } from "@/lib/forge.server";

export const Route = createFileRoute("/api/forge")({
  server: { handlers: { POST: ({ request }) => handleForge(request) } },
});
