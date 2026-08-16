"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  clearPendingTwoFactorChallenge,
  createSession,
  createTwoFactorChallenge,
  destroySession,
  getPendingTwoFactorChallengeId,
  hashOtpCode,
  hashPassword,
  verifyPassword,
  TWO_FACTOR_MAX_ATTEMPTS,
} from "@/lib/auth";
import { sendTwoFactorCodeEmail } from "@/lib/email";
import { STAFF_ROLES } from "@/lib/guards";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export interface ActionState {
  error?: string;
  sent?: boolean;
}

export async function loginAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Email ou mot de passe invalide." };
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Identifiants incorrects." };
  }

  // Les comptes organisateur/arbitre/admin passent par un code de
  // vérification envoyé par email avant que la session ne soit ouverte ;
  // les comptes joueur se connectent directement.
  if (STAFF_ROLES.includes(user.role)) {
    const code = await createTwoFactorChallenge(user.id);
    try {
      await sendTwoFactorCodeEmail(user.email, code);
    } catch {
      await clearPendingTwoFactorChallenge();
      return {
        error:
          "Impossible d'envoyer le code de vérification pour le moment. Réessayez dans un instant.",
      };
    }
    redirect("/login/code");
  }

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sessionVersion: user.sessionVersion,
  });

  redirect("/");
}

const verifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Code à 6 chiffres requis."),
});

export async function verifyTwoFactorAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const challengeId = await getPendingTwoFactorChallengeId();
  if (!challengeId) {
    redirect("/login");
  }

  const parsed = verifyCodeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Code invalide." };
  }

  const challenge = await prisma.twoFactorChallenge.findUnique({
    where: { id: challengeId },
    include: { user: true },
  });

  if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) {
    await clearPendingTwoFactorChallenge();
    return { error: "Code expiré. Merci de vous reconnecter." };
  }

  if (challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
    // Ne pas effacer le cookie ici : soumettre le formulaire déclenche un
    // nouveau rendu de cette page, dont le garde-fou (voir /login/code)
    // redirigerait aussitôt vers /login dès que le cookie disparaît,
    // empêchant ce message de s'afficher. Le défi reste bloqué (cette
    // branche est ré-atteinte à chaque tentative) jusqu'à son expiration
    // naturelle ou un clic sur "Annuler et retourner à la connexion".
    return { error: "Trop de tentatives incorrectes. Merci de vous reconnecter." };
  }

  if (hashOtpCode(parsed.data.code) !== challenge.codeHash) {
    await prisma.twoFactorChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return { error: "Code incorrect." };
  }

  await prisma.twoFactorChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });
  await clearPendingTwoFactorChallenge();

  const { user } = challenge;
  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sessionVersion: user.sessionVersion,
  });

  redirect("/");
}

export async function resendTwoFactorCodeAction(
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const challengeId = await getPendingTwoFactorChallengeId();
  if (!challengeId) {
    redirect("/login");
  }

  const challenge = await prisma.twoFactorChallenge.findUnique({
    where: { id: challengeId },
    include: { user: true },
  });
  if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) {
    await clearPendingTwoFactorChallenge();
    redirect("/login");
  }

  const cooldownMs = 30_000;
  if (Date.now() - challenge.createdAt.getTime() < cooldownMs) {
    return { error: "Merci de patienter un instant avant de redemander un code." };
  }

  // Invalide l'ancien défi pour éviter que deux codes ne soient valides en
  // même temps, puis en crée un nouveau pour le même compte.
  await prisma.twoFactorChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  const code = await createTwoFactorChallenge(challenge.user.id);
  try {
    await sendTwoFactorCodeEmail(challenge.user.email, code);
  } catch {
    return {
      error: "Impossible d'envoyer le code pour le moment. Réessayez dans un instant.",
    };
  }

  return { sent: true };
}

export async function cancelTwoFactorAction() {
  const challengeId = await getPendingTwoFactorChallengeId();
  if (challengeId) {
    await prisma.twoFactorChallenge.update({
      where: { id: challengeId },
      data: { consumedAt: new Date() },
    });
  }
  await clearPendingTwoFactorChallenge();
  redirect("/login");
}

const registerSchema = z.object({
  name: z.string().min(2, "Le nom est trop court."),
  email: z.string().email("Email invalide."),
  password: z.string().min(6, "6 caractères minimum."),
});

export async function registerAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Un compte existe déjà avec cet email." };
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "PLAYER",
      player: {
        create: {
          firstName: name.split(" ")[0] ?? name,
          lastName: name.split(" ").slice(1).join(" ") || "-",
        },
      },
    },
  });

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sessionVersion: user.sessionVersion,
  });

  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
