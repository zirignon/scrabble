import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";

/** Enregistre une trace exploitable des opérations d'administration sensibles. */
export async function writeAuditLog(
  actor: SessionPayload,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Prisma.InputJsonValue
) {
  await prisma.auditLog.create({
    data: { actorId: actor.userId, action, targetType, targetId, metadata },
  });
}
