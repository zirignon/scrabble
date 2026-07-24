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

export async function createTeamAction(tournamentId: string, formData: FormData) {
  const tournament = await assertCanManage(tournamentId);
  if (!tournament.isTeamEvent) throw new Error("Ce tournoi n'est pas en mode équipes.");

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) return;

  await prisma.team.create({
    data: { tournamentId, name: name.trim() },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/equipes`);
}

export async function deleteTeamAction(tournamentId: string, teamId: string) {
  await assertCanManage(tournamentId);
  await prisma.team.delete({ where: { id: teamId } });
  revalidatePath(`/admin/tournois/${tournamentId}/equipes`);
}

export async function addTeamMemberAction(
  tournamentId: string,
  teamId: string,
  formData: FormData
) {
  await assertCanManage(tournamentId);
  const playerId = formData.get("playerId");
  if (typeof playerId !== "string" || !playerId) return;

  const alreadyInTeam = await prisma.teamMember.findFirst({
    where: { playerId, team: { tournamentId } },
  });
  if (alreadyInTeam) {
    throw new Error("Ce joueur appartient déjà à une équipe de ce tournoi.");
  }

  const last = await prisma.teamMember.findFirst({
    where: { teamId },
    orderBy: { board: "desc" },
  });

  await prisma.teamMember.create({
    data: { teamId, playerId, board: (last?.board ?? 0) + 1 },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/equipes`);
}

export async function removeTeamMemberAction(
  tournamentId: string,
  memberId: string
) {
  await assertCanManage(tournamentId);
  await prisma.teamMember.delete({ where: { id: memberId } });
  revalidatePath(`/admin/tournois/${tournamentId}/equipes`);
}
