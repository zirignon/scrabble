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

export async function createPoolAction(tournamentId: string, formData: FormData) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.format !== "GROUPS" && tournament.format !== "COMBINED") {
    throw new Error("Ce tournoi n'est pas au format poules.");
  }

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) return;

  await prisma.pool.create({
    data: { tournamentId, name: name.trim() },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/poules`);
}

export async function deletePoolAction(tournamentId: string, poolId: string) {
  await assertCanManage(tournamentId);
  await prisma.pool.delete({ where: { id: poolId } });
  revalidatePath(`/admin/tournois/${tournamentId}/poules`);
}

export async function addPoolMemberAction(
  tournamentId: string,
  poolId: string,
  formData: FormData
) {
  await assertCanManage(tournamentId);
  const playerId = formData.get("playerId");
  if (typeof playerId !== "string" || !playerId) return;

  const alreadyInPool = await prisma.poolMember.findFirst({
    where: { playerId, pool: { tournamentId } },
  });
  if (alreadyInPool) {
    throw new Error("Ce joueur appartient déjà à une poule de ce tournoi.");
  }

  await prisma.poolMember.create({ data: { poolId, playerId } });

  revalidatePath(`/admin/tournois/${tournamentId}/poules`);
}

export async function removePoolMemberAction(
  tournamentId: string,
  memberId: string
) {
  await assertCanManage(tournamentId);
  await prisma.poolMember.delete({ where: { id: memberId } });
  revalidatePath(`/admin/tournois/${tournamentId}/poules`);
}

export async function assignTeamToPoolAction(
  tournamentId: string,
  poolId: string,
  formData: FormData
) {
  await assertCanManage(tournamentId);
  const teamId = formData.get("teamId");
  if (typeof teamId !== "string" || !teamId) return;

  await prisma.team.update({ where: { id: teamId }, data: { poolId } });

  revalidatePath(`/admin/tournois/${tournamentId}/poules`);
}

export async function removeTeamFromPoolAction(
  tournamentId: string,
  teamId: string
) {
  await assertCanManage(tournamentId);
  await prisma.team.update({ where: { id: teamId }, data: { poolId: null } });
  revalidatePath(`/admin/tournois/${tournamentId}/poules`);
}

export async function updateQualifiersPerPoolAction(
  tournamentId: string,
  formData: FormData
) {
  await assertCanManage(tournamentId);
  const raw = formData.get("qualifiersPerPool");
  const qualifiersPerPool = raw && String(raw).trim() ? Number(raw) : null;
  if (qualifiersPerPool !== null && (!Number.isInteger(qualifiersPerPool) || qualifiersPerPool < 1)) {
    return;
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { qualifiersPerPool },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/poules`);
}

export async function updatePoolRoundsCountAction(
  tournamentId: string,
  formData: FormData
) {
  await assertCanManage(tournamentId);
  const raw = formData.get("poolRoundsCount");
  const poolRoundsCount = raw && String(raw).trim() ? Number(raw) : null;
  if (poolRoundsCount !== null && (!Number.isInteger(poolRoundsCount) || poolRoundsCount < 1)) {
    return;
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { poolRoundsCount },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/poules`);
}
