"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { slugify } from "@/lib/slug";
import type { ActionState } from "@/lib/actions/auth";

const tournamentSchema = z.object({
  name: z.string().min(3, "Le nom est trop court."),
  type: z.enum(["CLASSIC", "DUPLICATE"]),
  format: z.enum(["ROUND_ROBIN", "SWISS", "GROUPS", "KNOCKOUT"]).optional(),
  duplicateFormula: z
    .enum(["NORMALE", "SEMI_RAPIDE", "BLITZ", "JOKER", "SEPT_SUR_HUIT", "SEPT_ET_HUIT"])
    .optional(),
  isTeamEvent: z.string().optional(),
  venue: z.string().optional(),
  description: z.string().optional(),
  startDate: z.string().min(1, "Date de début requise."),
  endDate: z.string().optional(),
});

export async function createTournamentAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireRole(STAFF_ROLES);

  const parsed = tournamentSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    format: formData.get("format") || undefined,
    duplicateFormula: formData.get("duplicateFormula") || undefined,
    isTeamEvent: formData.get("isTeamEvent") || undefined,
    venue: formData.get("venue") || undefined,
    description: formData.get("description") || undefined,
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const {
    name,
    type,
    format,
    duplicateFormula,
    isTeamEvent,
    venue,
    description,
    startDate,
    endDate,
  } = parsed.data;

  const baseSlug = slugify(name) || "tournoi";
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.tournament.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const tournament = await prisma.tournament.create({
    data: {
      name,
      slug,
      type,
      format: type === "CLASSIC" ? format ?? "ROUND_ROBIN" : null,
      duplicateFormula: type === "DUPLICATE" ? duplicateFormula ?? "NORMALE" : null,
      isTeamEvent: isTeamEvent === "on",
      venue,
      description,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      organizerId: session.userId,
      status: "DRAFT",
    },
  });

  revalidatePath("/admin");
  revalidatePath("/tournois");
  redirect(`/admin/tournois/${tournament.id}`);
}

const duplicateFormulaValues = [
  "NORMALE",
  "SEMI_RAPIDE",
  "BLITZ",
  "JOKER",
  "SEPT_SUR_HUIT",
  "SEPT_ET_HUIT",
] as const;

export async function updateDuplicateFormulaAction(
  tournamentId: string,
  formData: FormData
) {
  const session = await requireRole(STAFF_ROLES);
  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
  });
  if (!canManageTournament(session, tournament.organizerId)) {
    throw new Error("Non autorisé.");
  }
  if (tournament.type !== "DUPLICATE") return;

  const formula = formData.get("duplicateFormula");
  if (typeof formula !== "string" || !duplicateFormulaValues.includes(formula as never)) {
    return;
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { duplicateFormula: formula as (typeof duplicateFormulaValues)[number] },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/parties`);
}

const statusValues = [
  "DRAFT",
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "IN_PROGRESS",
  "COMPLETED",
  "ARCHIVED",
] as const;

export async function updateTournamentStatusAction(
  tournamentId: string,
  status: (typeof statusValues)[number]
) {
  const session = await requireRole(STAFF_ROLES);
  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
  });
  if (!canManageTournament(session, tournament.organizerId)) {
    throw new Error("Non autorisé.");
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status },
  });

  revalidatePath(`/admin/tournois/${tournamentId}`);
  revalidatePath(`/tournois/${tournament.slug}`);
}

export async function updateTournamentStatusFormAction(
  tournamentId: string,
  formData: FormData
) {
  const status = formData.get("status");
  if (typeof status !== "string" || !statusValues.includes(status as never)) {
    return;
  }
  await updateTournamentStatusAction(
    tournamentId,
    status as (typeof statusValues)[number]
  );
}

export async function registerPlayerAction(
  tournamentId: string,
  formData: FormData
) {
  const session = await requireRole(STAFF_ROLES);
  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
  });
  if (!canManageTournament(session, tournament.organizerId)) {
    throw new Error("Non autorisé.");
  }

  const playerId = formData.get("playerId");
  if (typeof playerId !== "string" || !playerId) return;

  await prisma.registration.upsert({
    where: { tournamentId_playerId: { tournamentId, playerId } },
    update: { status: "CONFIRMED" },
    create: { tournamentId, playerId, status: "CONFIRMED" },
  });

  revalidatePath(`/admin/tournois/${tournamentId}`);
}

export async function unregisterPlayerAction(
  tournamentId: string,
  playerId: string
) {
  const session = await requireRole(STAFF_ROLES);
  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
  });
  if (!canManageTournament(session, tournament.organizerId)) {
    throw new Error("Non autorisé.");
  }

  await prisma.registration.delete({
    where: { tournamentId_playerId: { tournamentId, playerId } },
  });

  revalidatePath(`/admin/tournois/${tournamentId}`);
}

export async function selfRegisterAction(tournamentId: string) {
  const session = await requireUser();
  const player = await prisma.player.findUnique({
    where: { userId: session.userId },
  });
  if (!player) {
    throw new Error("Aucune fiche joueur associée à ce compte.");
  }

  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
  });
  if (tournament.status !== "REGISTRATION_OPEN") {
    throw new Error("Les inscriptions ne sont pas ouvertes.");
  }

  await prisma.registration.upsert({
    where: { tournamentId_playerId: { tournamentId, playerId: player.id } },
    update: { status: "CONFIRMED" },
    create: { tournamentId, playerId: player.id, status: "CONFIRMED" },
  });

  revalidatePath(`/tournois/${tournament.slug}`);
}
