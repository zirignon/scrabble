import "server-only";

import { cookies } from "next/headers";
import { randomInt, createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasSecureSessionSecret } from "@/lib/security";

const SESSION_COOKIE = "session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

const TWO_FACTOR_COOKIE = "pending_2fa";
const TWO_FACTOR_TTL_SECONDS = 60 * 10; // 10 minutes
export const TWO_FACTOR_MAX_ATTEMPTS = 5;

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  if (
    process.env.NODE_ENV === "production" &&
    !hasSecureSessionSecret(secret)
  ) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: Role;
  sessionVersion: number;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("scrabble-app")
    .setAudience("scrabble-app")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export function generateOtpCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// Le SESSION_SECRET sert de poivre : un accès en lecture à la base seule ne
// suffit pas à rejouer les hashs de code hors ligne.
export function hashOtpCode(code: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return createHash("sha256").update(`${secret}:${code}`).digest("hex");
}

/** Crée un défi 2FA en base, pose le cookie de session en attente, et
 * renvoie le code en clair (à charge de l'appelant de l'envoyer par email). */
export async function createTwoFactorChallenge(userId: string) {
  const code = generateOtpCode();
  const challenge = await prisma.twoFactorChallenge.create({
    data: {
      userId,
      codeHash: hashOtpCode(code),
      expiresAt: new Date(Date.now() + TWO_FACTOR_TTL_SECONDS * 1000),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(TWO_FACTOR_COOKIE, challenge.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TWO_FACTOR_TTL_SECONDS,
  });

  return code;
}

export async function getPendingTwoFactorChallengeId() {
  const cookieStore = await cookies();
  return cookieStore.get(TWO_FACTOR_COOKIE)?.value ?? null;
}

export async function clearPendingTwoFactorChallenge() {
  const cookieStore = await cookies();
  cookieStore.delete(TWO_FACTOR_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: "scrabble-app",
      audience: "scrabble-app",
    });
    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.sessionVersion !== "number" ||
      !["ADMIN", "ORGANIZER", "REFEREE", "PLAYER"].includes(payload.role as string)
    ) {
      return null;
    }

    // Ne jamais faire confiance durablement au rôle présent dans le JWT : un
    // administrateur rétrogradé (ou un compte supprimé) doit perdre son accès
    // immédiatement, sans attendre l'expiration du cookie.
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, role: true, sessionVersion: true },
    });
    if (!user || user.sessionVersion !== payload.sessionVersion) return null;

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionVersion: user.sessionVersion,
    };
  } catch {
    return null;
  }
}
