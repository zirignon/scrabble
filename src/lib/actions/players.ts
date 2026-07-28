"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, STAFF_ROLES } from "@/lib/guards";
import type { ActionState } from "@/lib/actions/auth";
import { importPlayersCsvChunk, type PlayerImportSummary } from "@/lib/players/import";

const optionalInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().int().optional()
);

const playerSchema = z.object({
  firstName: z.string().min(1, "Prénom requis."),
  lastName: z.string().min(1, "Nom requis."),
  clubId: z.string().optional(),
  licenseNumber: z.string().optional(),
  category: z.string().optional(),
  classification: z.string().optional(),
  classificationClassic: z.string().optional(),
  coefficientClassic: optionalInt,
  eloDuplicate: optionalInt,
  eloClassic: optionalInt,
  nationality: z.string().optional(),
  federation: z.string().optional(),
});

// Crée un nouveau joueur, ou met à jour un joueur existant si un
// `playerId` est fourni (cas d'une suggestion sélectionnée dans
// l'autocomplétion du formulaire — voir PlayerForm).
export async function savePlayerAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(STAFF_ROLES);

  const playerId = formData.get("playerId");

  const parsed = playerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    clubId: formData.get("clubId") || undefined,
    licenseNumber: formData.get("licenseNumber") || undefined,
    category: formData.get("category") || undefined,
    classification: formData.get("classification") || undefined,
    classificationClassic: formData.get("classificationClassic") || undefined,
    coefficientClassic: formData.get("coefficientClassic") || undefined,
    eloDuplicate: formData.get("eloDuplicate") || undefined,
    eloClassic: formData.get("eloClassic") || undefined,
    nationality: formData.get("nationality") || undefined,
    federation: formData.get("federation") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  try {
    if (typeof playerId === "string" && playerId) {
      await prisma.player.update({ where: { id: playerId }, data: parsed.data });
    } else {
      await prisma.player.create({ data: parsed.data });
    }
  } catch {
    return { error: "Un joueur avec ce n° de licence existe déjà." };
  }

  revalidatePath("/admin/joueurs");
  return {};
}

export async function deletePlayerAction(playerId: string) {
  await requireRole(STAFF_ROLES);
  await prisma.player.delete({ where: { id: playerId } });
  revalidatePath("/admin/joueurs");
}

export async function importPlayersChunkAction(
  text: string
): Promise<PlayerImportSummary> {
  await requireRole(STAFF_ROLES);
  const summary = await importPlayersCsvChunk(text);
  revalidatePath("/admin/joueurs");
  revalidatePath("/admin/clubs");
  return summary;
}
