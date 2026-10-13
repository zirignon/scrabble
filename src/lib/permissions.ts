import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";

// Pleins pouvoirs sur un tournoi (réglages, suppression de données,
// génération des rondes...) : réservés à ADMIN ou à l'organisateur exact
// qui l'a créé. Un REFEREE qui n'a pas lui-même créé ce tournoi n'est
// jamais "manager" au sens de cette fonction, même s'il y est assigné
// comme arbitre — voir canRecordResults ci-dessous pour ce cas.
export function canManageTournament(
  session: Pick<SessionPayload, "role" | "userId">,
  tournamentOrganizerId: string
): boolean {
  return session.role === "ADMIN" || session.userId === tournamentOrganizerId;
}

// Un compte REFEREE a-t-il été explicitement désigné par l'organisateur
// pour assister sur ce tournoi précis (voir le modèle TournamentReferee,
// assignRefereeAction) ? Distinct de "avoir créé ce tournoi" (qui relève
// de canManageTournament) : un arbitre peut être assigné à un tournoi
// qu'il n'a pas créé lui-même.
export async function isAssignedReferee(
  userId: string,
  tournamentId: string
): Promise<boolean> {
  const assignment = await prisma.tournamentReferee.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });
  return assignment !== null;
}

// Saisie des scores/résultats (matchs classiques, scores/coups duplicate)
// uniquement — jamais la configuration du tournoi ni la suppression de
// données, qui restent réservées à canManageTournament. Accordé à ADMIN/
// l'organisateur (qui peuvent de toute façon tout faire), ou à un REFEREE
// explicitement assigné à ce tournoi via TournamentReferee.
export async function canRecordResults(
  session: Pick<SessionPayload, "role" | "userId">,
  tournament: { id: string; organizerId: string }
): Promise<boolean> {
  if (canManageTournament(session, tournament.organizerId)) return true;
  if (session.role !== "REFEREE") return false;
  return isAssignedReferee(session.userId, tournament.id);
}
