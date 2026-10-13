import { prisma } from "@/lib/prisma";

// Levée quand une sous-ressource (ronde, match, poule, équipe, partie...)
// fournie par le client n'appartient pas au tournoi déjà validé par
// canManageTournament — voir assertResourceInTournament ci-dessous.
export class ResourceNotInTournamentError extends Error {
  constructor() {
    super("Ressource introuvable pour ce tournoi.");
  }
}

type TournamentScopedResource =
  | { kind: "round"; id: string }
  | { kind: "match"; id: string }
  | { kind: "pool"; id: string }
  | { kind: "poolMember"; id: string }
  | { kind: "team"; id: string }
  | { kind: "teamMember"; id: string }
  | { kind: "game"; id: string };

async function lookupTournamentId(
  resource: TournamentScopedResource
): Promise<string | undefined> {
  switch (resource.kind) {
    case "round": {
      const round = await prisma.round.findUnique({
        where: { id: resource.id },
        select: { tournamentId: true },
      });
      return round?.tournamentId;
    }
    case "match": {
      const match = await prisma.match.findUnique({
        where: { id: resource.id },
        select: { round: { select: { tournamentId: true } } },
      });
      return match?.round.tournamentId;
    }
    case "pool": {
      const pool = await prisma.pool.findUnique({
        where: { id: resource.id },
        select: { tournamentId: true },
      });
      return pool?.tournamentId;
    }
    case "poolMember": {
      const member = await prisma.poolMember.findUnique({
        where: { id: resource.id },
        select: { pool: { select: { tournamentId: true } } },
      });
      return member?.pool.tournamentId;
    }
    case "team": {
      const team = await prisma.team.findUnique({
        where: { id: resource.id },
        select: { tournamentId: true },
      });
      return team?.tournamentId;
    }
    case "teamMember": {
      const member = await prisma.teamMember.findUnique({
        where: { id: resource.id },
        select: { team: { select: { tournamentId: true } } },
      });
      return member?.team.tournamentId;
    }
    case "game": {
      const game = await prisma.game.findUnique({
        where: { id: resource.id },
        select: { tournamentId: true },
      });
      return game?.tournamentId;
    }
  }
}

// Vérifie qu'une sous-ressource appartient bien au tournoi déjà validé par
// canManageTournament (requireRole + canManageTournament ne valident que
// tournamentId) — sans ce contrôle, un organisateur authentifié sur SON
// tournoi pourrait, en changeant juste l'ID de la sous-ressource dans la
// requête, agir sur celle d'un AUTRE tournoi (IDOR) : falsifier un score,
// supprimer une poule ou une équipe qui ne lui appartient pas, etc. La base
// de données fait foi, jamais la cohérence supposée des identifiants
// envoyés par le client. À appeler juste après assertCanManage/
// canManageTournament, avant toute lecture ou écriture portant sur cette
// sous-ressource.
export async function assertResourceInTournament(
  tournamentId: string,
  resource: TournamentScopedResource
): Promise<void> {
  const actualTournamentId = await lookupTournamentId(resource);
  if (actualTournamentId !== tournamentId) {
    throw new ResourceNotInTournamentError();
  }
}

// Même principe qu'assertResourceInTournament, mais pour un coup (coup par
// coup ou coup de référence, saisie duplicate) : sa portée naturelle dans
// ces actions est la partie (gameId, déjà vérifiée séparément via
// assertResourceInTournament({ kind: "game" })), pas directement le
// tournoi. Plus précis qu'une vérification au seul niveau tournoi — empêche
// aussi de cibler un coup d'une AUTRE partie du MÊME tournoi — et suffisant
// puisque gameId est lui-même déjà rattaché au bon tournoi.
export async function assertMoveInGame(gameId: string, moveId: string): Promise<void> {
  const move = await prisma.duplicateMove.findUnique({
    where: { id: moveId },
    select: { gameId: true },
  });
  if (move?.gameId !== gameId) {
    throw new ResourceNotInTournamentError();
  }
}

export async function assertReferenceMoveInGame(gameId: string, moveId: string): Promise<void> {
  const move = await prisma.referenceMove.findUnique({
    where: { id: moveId },
    select: { gameId: true },
  });
  if (move?.gameId !== gameId) {
    throw new ResourceNotInTournamentError();
  }
}
