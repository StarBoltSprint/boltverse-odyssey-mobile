import { createFileRoute } from "@tanstack/react-router";
import { handleBot } from "@/lib/bot/http.server";

const handle = ({ request }: { request: Request }) => handleBot(request);

export const Route = createFileRoute("/api/bot")({
  server: { handlers: { GET: handle, POST: handle } },
});
