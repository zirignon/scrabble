import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDisplayData } from "@/lib/display";

// Endpoint public (pas d'authentification) interrogé par la page d'affichage
// grand écran pour se rafraîchir périodiquement. Accepte l'id ou le slug du
// tournoi pour rester utilisable directement depuis la page publique.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tournament = await prisma.tournament.findFirst({
    where: { OR: [{ id }, { slug: id }] },
  });
  if (!tournament) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const data = await getDisplayData(tournament.id);
  return NextResponse.json(data);
}
