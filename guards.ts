import "server-only";

import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "@/lib/auth";
import type { Role } from "@prisma/client";

export const STAFF_ROLES: Role[] = ["ADMIN", "ORGANIZER", "REFEREE"];

export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function requireRole(roles: Role[]): Promise<SessionPayload> {
  const session = await requireUser();
  if (!roles.includes(session.role)) {
    redirect("/");
  }
  return session;
}

export function canManageTournament(
  session: SessionPayload,
  tournamentOrganizerId: string
) {
  return session.role === "ADMIN" || session.userId === tournamentOrganizerId;
}
