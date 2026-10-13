import "server-only";

import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "@/lib/auth";
import type { Role } from "@prisma/client";

// Réexportées depuis src/lib/permissions.ts, qui n'importe ni "server-only"
// ni next/headers : ces fonctions ne lisent pas la session elles-mêmes
// (contrairement à requireUser/requireRole ci-dessous), ce qui les rend
// testables directement (voir tests/permissions.test.ts).
export { canManageTournament, canRecordResults, isAssignedReferee } from "@/lib/permissions";

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
