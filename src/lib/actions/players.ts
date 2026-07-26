"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, STAFF_ROLES } from "@/lib/guards";
import type { ActionState } from "@/lib/actions/auth";

const playerSchema = z.object({
  firstName: z.string().min(1, "Prénom requis."),
  lastName: z.string().min(1, "Nom requis."),
  clubId: z.string().optional(),
  licenseNumber: z.string().optional(),
  category: z.string().optional(),
  classification: z.string().optional(),
  nationality: z.string().optional(),
});

export async function createPlayerAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(STAFF_ROLES);

  const parsed = playerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    clubId: formData.get("clubId") || undefined,
    licenseNumber: formData.get("licenseNumber") || undefined,
    category: formData.get("category") || undefined,
    classification: formData.get("classification") || undefined,
    nationality: formData.get("nationality") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  await prisma.player.create({ data: parsed.data });

  revalidatePath("/admin/joueurs");
  return {};
}

export async function deletePlayerAction(playerId: string) {
  await requireRole(STAFF_ROLES);
  await prisma.player.delete({ where: { id: playerId } });
  revalidatePath("/admin/joueurs");
}
