"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";

async function assertCanManage(tournamentId: string) {
  const session = await requireRole(STAFF_ROLES);
  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
  });
  if (!canManageTournament(session, tournament.organizerId)) {
    throw new Error("Non autorisé.");
  }
  return tournament;
}

// Désigne un compte REFEREE existant pour assister sur CE tournoi (voir
// canRecordResults, src/lib/permissions.ts) — réservé à ADMIN/
// l'organisateur de ce tournoi, jamais à l'arbitre lui-même.
export async function assignRefereeAction(tournamentId: string, formData: FormData) {
  await assertCanManage(tournamentId);
  const userId = formData.get("userId");
  if (typeof userId !== "string" || !userId) return;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "REFEREE") {
    throw new Error("Ce compte n'est pas un compte arbitre.");
  }

  await prisma.tournamentReferee.upsert({
    where: { tournamentId_userId: { tournamentId, userId } },
    update: {},
    create: { tournamentId, userId },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/reglages`);
}

export async function unassignRefereeAction(tournamentId: string, userId: string) {
  await assertCanManage(tournamentId);
  // Filtre composé sur (tournamentId, userId) : sans ligne correspondant
  // aux deux à la fois, ne supprime rien — aucun risque de toucher
  // l'assignation d'un autre tournoi même avec un userId arbitraire.
  await prisma.tournamentReferee.deleteMany({ where: { tournamentId, userId } });
  revalidatePath(`/admin/tournois/${tournamentId}/reglages`);
}
