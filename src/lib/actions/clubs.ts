"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guards";
import type { ActionState } from "@/lib/actions/auth";

const clubSchema = z.object({
  name: z.string().min(2, "Le nom du club est trop court."),
  city: z.string().optional(),
  federation: z.string().optional(),
});

export async function createClubAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(["ADMIN"]);

  const parsed = clubSchema.safeParse({
    name: formData.get("name"),
    city: formData.get("city") || undefined,
    federation: formData.get("federation") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  try {
    await prisma.club.create({ data: parsed.data });
  } catch {
    return { error: "Un club avec ce nom existe déjà." };
  }

  revalidatePath("/admin/clubs");
  return {};
}

export async function deleteClubAction(clubId: string) {
  await requireRole(["ADMIN"]);
  await prisma.club.delete({ where: { id: clubId } });
  revalidatePath("/admin/clubs");
}

export async function updateClubAction(
  clubId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(["ADMIN"]);

  const parsed = clubSchema.safeParse({
    name: formData.get("name"),
    city: formData.get("city") || undefined,
    federation: formData.get("federation") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  try {
    await prisma.club.update({ where: { id: clubId }, data: parsed.data });
  } catch {
    return { error: "Un club avec ce nom existe déjà." };
  }

  revalidatePath("/admin/clubs");
  return {};
}
