import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  assertResourceInTournament,
  assertMoveInGame,
  assertReferenceMoveInGame,
  ResourceNotInTournamentError,
} from "../src/lib/actions/resourceGuards";

const prisma = new PrismaClient();

// Ces tests vérifient, contre une vraie base PostgreSQL, le cœur du
// correctif IDOR : un organisateur qui gère réellement le tournoi A ne doit
// jamais pouvoir agir sur une sous-ressource (poule, équipe, ronde, match,
// partie, coup...) qui appartient en réalité à un tournoi B, même en
// fournissant un tournamentId=A valide à l'action — voir resourceGuards.ts.
// Nécessitent une base accessible (DATABASE_URL) ; la CI
// (.github/workflows/ci.yml) n'en provisionne aucune, ce test s'y désactive
// donc automatiquement (t.skip, vérifié à l'exécution plutôt qu'au chargement
// du module pour éviter un top-level await, non supporté par la sortie CJS
// de tsx) plutôt que de faire échouer le pipeline.
test(
  "assertResourceInTournament/assertMoveInGame/assertReferenceMoveInGame referment l'IDOR entre deux tournois",
  async (t) => {
    const dbAvailable = await prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);
    if (!dbAvailable) {
      t.skip("base de données indisponible (attendu en CI)");
      return;
    }

    const organizer = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

    const tournamentA = await prisma.tournament.create({
      data: {
        name: "IDOR test A",
        slug: `idor-test-a-${Date.now()}`,
        type: "CLASSIC",
        format: "ROUND_ROBIN",
        organizerId: organizer.id,
        startDate: new Date(),
      },
    });
    const tournamentB = await prisma.tournament.create({
      data: {
        name: "IDOR test B",
        slug: `idor-test-b-${Date.now()}`,
        type: "CLASSIC",
        format: "ROUND_ROBIN",
        organizerId: organizer.id,
        startDate: new Date(),
      },
    });

    const [playerA1, playerA2, playerB1, playerB2] = await Promise.all([
      prisma.player.create({ data: { firstName: "A1", lastName: "Test" } }),
      prisma.player.create({ data: { firstName: "A2", lastName: "Test" } }),
      prisma.player.create({ data: { firstName: "B1", lastName: "Test" } }),
      prisma.player.create({ data: { firstName: "B2", lastName: "Test" } }),
    ]);

    async function seedTournamentResources(tournamentId: string, p1: string, p2: string) {
      const pool = await prisma.pool.create({ data: { tournamentId, name: `Poule ${tournamentId}` } });
      const team = await prisma.team.create({ data: { tournamentId, name: `Equipe ${tournamentId}` } });
      const teamMember = await prisma.teamMember.create({ data: { teamId: team.id, playerId: p1, board: 1 } });
      const round = await prisma.round.create({ data: { tournamentId, number: 1 } });
      const match = await prisma.match.create({
        data: { roundId: round.id, homePlayerId: p1, awayPlayerId: p2, status: "SCHEDULED" },
      });
      const poolMember = await prisma.poolMember.create({ data: { poolId: pool.id, playerId: p2 } });
      const game = await prisma.game.create({ data: { tournamentId, number: 1 } });
      const move = await prisma.duplicateMove.create({
        data: { gameId: game.id, playerId: p1, turnNumber: 1 },
      });
      const referenceMove = await prisma.referenceMove.create({
        data: { gameId: game.id, turnNumber: 1, row: 8, col: 8, direction: "ACROSS" },
      });
      return { pool, team, teamMember, round, match, poolMember, game, move, referenceMove };
    }

    const a = await seedTournamentResources(tournamentA.id, playerA1.id, playerA2.id);
    const b = await seedTournamentResources(tournamentB.id, playerB1.id, playerB2.id);

    try {
      // Depuis le tournoi A, chaque ressource du tournoi B doit être
      // refusée (IDOR bloqué)...
      await assert.rejects(
        () => assertResourceInTournament(tournamentA.id, { kind: "pool", id: b.pool.id }),
        ResourceNotInTournamentError
      );
      await assert.rejects(
        () => assertResourceInTournament(tournamentA.id, { kind: "team", id: b.team.id }),
        ResourceNotInTournamentError
      );
      await assert.rejects(
        () => assertResourceInTournament(tournamentA.id, { kind: "teamMember", id: b.teamMember.id }),
        ResourceNotInTournamentError
      );
      await assert.rejects(
        () => assertResourceInTournament(tournamentA.id, { kind: "round", id: b.round.id }),
        ResourceNotInTournamentError
      );
      await assert.rejects(
        () => assertResourceInTournament(tournamentA.id, { kind: "match", id: b.match.id }),
        ResourceNotInTournamentError
      );
      await assert.rejects(
        () => assertResourceInTournament(tournamentA.id, { kind: "poolMember", id: b.poolMember.id }),
        ResourceNotInTournamentError
      );
      await assert.rejects(
        () => assertResourceInTournament(tournamentA.id, { kind: "game", id: b.game.id }),
        ResourceNotInTournamentError
      );
      // ... alors que la même ressource, prise dans son propre tournoi, est
      // acceptée sans erreur.
      await assert.doesNotReject(() =>
        assertResourceInTournament(tournamentA.id, { kind: "pool", id: a.pool.id })
      );
      await assert.doesNotReject(() =>
        assertResourceInTournament(tournamentA.id, { kind: "team", id: a.team.id })
      );
      await assert.doesNotReject(() =>
        assertResourceInTournament(tournamentA.id, { kind: "teamMember", id: a.teamMember.id })
      );
      await assert.doesNotReject(() =>
        assertResourceInTournament(tournamentA.id, { kind: "round", id: a.round.id })
      );
      await assert.doesNotReject(() =>
        assertResourceInTournament(tournamentA.id, { kind: "match", id: a.match.id })
      );
      await assert.doesNotReject(() =>
        assertResourceInTournament(tournamentA.id, { kind: "poolMember", id: a.poolMember.id })
      );
      await assert.doesNotReject(() =>
        assertResourceInTournament(tournamentA.id, { kind: "game", id: a.game.id })
      );

      // Un identifiant qui n'existe pas du tout doit être refusé, pas planter.
      await assert.rejects(
        () => assertResourceInTournament(tournamentA.id, { kind: "pool", id: "introuvable" }),
        ResourceNotInTournamentError
      );

      // Coups (coup par coup et coup de référence) : la portée naturelle
      // est la partie (gameId), pas directement le tournoi — vérifie qu'un
      // coup de la partie B est refusé en ciblant la partie A, même quand
      // les deux parties appartiennent chacune à un tournoi distinct déjà
      // validé par ailleurs.
      await assert.rejects(
        () => assertMoveInGame(a.game.id, b.move.id),
        ResourceNotInTournamentError
      );
      await assert.doesNotReject(() => assertMoveInGame(a.game.id, a.move.id));
      await assert.rejects(
        () => assertReferenceMoveInGame(a.game.id, b.referenceMove.id),
        ResourceNotInTournamentError
      );
      await assert.doesNotReject(() =>
        assertReferenceMoveInGame(a.game.id, a.referenceMove.id)
      );
    } finally {
      await prisma.tournament.delete({ where: { id: tournamentA.id } });
      await prisma.tournament.delete({ where: { id: tournamentB.id } });
      await prisma.player.deleteMany({
        where: { id: { in: [playerA1.id, playerA2.id, playerB1.id, playerB2.id] } },
      });
      await prisma.$disconnect();
    }
  }
);
