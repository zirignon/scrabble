import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDisplayData } from "@/lib/display";
import { subscribeTournamentUpdates } from "@/lib/displayEvents";

const HEARTBEAT_MS = 25000;

// Flux SSE public (pas d'authentification, comme la page d'affichage) : pousse
// immédiatement les données à jour dès qu'une action pertinente est
// enregistrée pour ce tournoi (score, chrono, ronde générée...), au lieu de
// faire attendre le client jusqu'au prochain sondage.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tournament = await prisma.tournament.findFirst({
    where: { OR: [{ id }, { slug: id }] },
  });
  if (!tournament) {
    return new Response("Tournoi introuvable", { status: 404 });
  }

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval>;
  let unsubscribe: () => void;

  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: unknown) {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      async function pushLatest() {
        try {
          const data = await getDisplayData(tournament!.id);
          send(data);
        } catch {
          // Le tournoi peut avoir été supprimé entre-temps ; on ignore.
        }
      }

      await pushLatest();
      unsubscribe = subscribeTournamentUpdates(tournament.id, () => {
        pushLatest();
      });
      heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      });
    },
    cancel() {
      closed = true;
      clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
