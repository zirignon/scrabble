"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guards";
import { hashPassword } from "@/lib/auth";
import type { ActionState } from "@/lib/actions/auth";

const roleValues = ["ADMIN", "ORGANIZER", "REFEREE", "PLAYER"] as const;

const createUserSchema = z.object({
  name: z.string().min(2, "Le nom est trop court."),
  email: z.string().email("Email invalide."),
  password: z.string().min(8, "8 caractères minimum."),
  role: z.enum(roleValues),
});

// Seul un administrateur peut créer un compte organisateur/arbitre/admin :
// il n'existe pas de parcours d'auto-inscription pour ces rôles (l'inscription
// publique ne crée que des comptes joueurs).
export async function createUserAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(["ADMIN"]);

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { name, email, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Un compte existe déjà avec cet email." };
  }

  await prisma.user.create({
    data: { name, email, role, passwordHash: await hashPassword(password) },
  });

  revalidatePath("/admin/utilisateurs");
  return {};
}

export async function updateUserRoleAction(userId: string, formData: FormData) {
  await requireRole(["ADMIN"]);

  const role = formData.get("role");
  if (typeof role !== "string" || !roleValues.includes(role as never)) return;

  await prisma.user.update({
    where: { id: userId },
    data: { role: role as (typeof roleValues)[number] },
  });

  revalidatePath("/admin/utilisateurs");
}

export async function resetUserPasswordAction(userId: string, formData: FormData) {
  await requireRole(["ADMIN"]);

  const password = formData.get("password");
  if (typeof password !== "string" || password.length < 8) return;

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });

  revalidatePath("/admin/utilisateurs");
}
