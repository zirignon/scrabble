import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { canManageTournament, canRecordResults, isAssignedReferee } from "../src/lib/permissions";

// canManageTournament est pure (aucun accès base) : ADMIN gère tout
// tournoi, un ORGANIZER/REFEREE ne gère que celui dont il est
// effectivement l'organisateur — jamais le tournoi d'un tiers simplement
// parce qu'il a un rôle staff.
test("canManageTournament : ADMIN gère tout, les autres rôles seulement leur propre tournoi", () => {
  const admin = { role: "ADMIN" as const, userId: "admin-1" };
  const organizer = { role: "ORGANIZER" as const, userId: "org-1" };
  const otherOrganizer = { role: "ORGANIZER" as const, userId: "org-2" };
  const referee = { role: "REFEREE" as const, userId: "ref-1" };

  assert.equal(canManageTournament(admin, "org-1"), true);
  assert.equal(canManageTournament(admin, "org-2"), true);
  assert.equal(canManageTournament(organizer, "org-1"), true);
  assert.equal(canManageTournament(otherOrganizer, "org-1"), false);
  assert.equal(canManageTournament(referee, "org-1"), false);
});

const prisma = new PrismaClient();

// isAssignedReferee/canRecordResults lisent TournamentReferee en base :
// ces tests créent deux tournois réels distincts (chacun son propre
// organisateur) et un compte REFEREE assigné à UN SEUL des deux, pour
// vérifier que l'assignation reste strictement cantonnée à son tournoi —
// le même principe que le correctif IDOR (assertResourceInTournament),
// appliqué ici à la fonctionnalité d'arbitre assigné. Nécessitent une
// base accessible (DATABASE_URL) ; absente en CI
// (.github/workflows/ci.yml ne provisionne aucun PostgreSQL), ce test s'y
// désactive donc automatiquement (t.skip) plutôt que de faire échouer le
// pipeline.
//
// Note : assignRefereeAction/unassignRefereeAction (src/lib/actions/
// referees.ts) ne sont pas appelées directement ici — comme toute Server
// Action démarrant par requireRole (qui lit la session via next/headers),
// elles ne sont invocables que dans une vraie requête Next.js, pas par un
// script Node autonome (aucun test de ce dépôt n'appelle une Server
// Action directement, pour cette raison). Leur contrôle d'accès
// (assertCanManage = requireRole + canManageTournament) est exactement
// celui déjà vérifié ci-dessus ; le flux complet (assignation/retrait
// via le vrai formulaire, accès accordé puis révoqué) a été vérifié en
// conditions réelles avec Playwright (voir le commit qui introduit cette
// fonctionnalité).
test(
  "canRecordResults/isAssignedReferee : un arbitre assigné à un tournoi ne peut pas agir sur un autre",
  async (t) => {
    const dbAvailable = await prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);
    if (!dbAvailable) {
      t.skip("base de données indisponible (attendu en CI)");
      return;
    }

    const bcrypt = await import("bcryptjs");
    const organizerA = await prisma.user.create({
      data: {
        email: `perm-org-a-${Date.now()}@test.local`,
        name: "Organisateur A",
        role: "ORGANIZER",
        passwordHash: await bcrypt.hash("x", 4),
      },
    });
    const organizerB = await prisma.user.create({
      data: {
        email: `perm-org-b-${Date.now()}@test.local`,
        name: "Organisateur B",
        role: "ORGANIZER",
        passwordHash: await bcrypt.hash("x", 4),
      },
    });
    const referee = await prisma.user.create({
      data: {
        email: `perm-ref-${Date.now()}@test.local`,
        name: "Arbitre",
        role: "REFEREE",
        passwordHash: await bcrypt.hash("x", 4),
      },
    });

    const tournamentA = await prisma.tournament.create({
      data: {
        name: "Permissions test A",
        slug: `permissions-test-a-${Date.now()}`,
        type: "CLASSIC",
        format: "ROUND_ROBIN",
        organizerId: organizerA.id,
        startDate: new Date(),
      },
    });
    const tournamentB = await prisma.tournament.create({
      data: {
        name: "Permissions test B",
        slug: `permissions-test-b-${Date.now()}`,
        type: "CLASSIC",
        format: "ROUND_ROBIN",
        organizerId: organizerB.id,
        startDate: new Date(),
      },
    });

    // L'arbitre n'est assigné qu'au tournoi A.
    await prisma.tournamentReferee.create({
      data: { tournamentId: tournamentA.id, userId: referee.id },
    });

    try {
      const refereeSession = { role: "REFEREE" as const, userId: referee.id };

      assert.equal(await isAssignedReferee(referee.id, tournamentA.id), true);
      assert.equal(await isAssignedReferee(referee.id, tournamentB.id), false);

      assert.equal(await canRecordResults(refereeSession, tournamentA), true);
      assert.equal(
        await canRecordResults(refereeSession, tournamentB),
        false,
        "un arbitre assigné au tournoi A ne doit jamais pouvoir saisir un résultat sur le tournoi B"
      );

      // L'organisateur de B (non assigné comme arbitre, mais gère son
      // propre tournoi) garde ses droits habituels.
      const organizerBSession = { role: "ORGANIZER" as const, userId: organizerB.id };
      assert.equal(await canRecordResults(organizerBSession, tournamentB), true);
      assert.equal(
        await canRecordResults(organizerBSession, tournamentA),
        false,
        "l'organisateur de B ne gère pas le tournoi A et n'y est pas assigné comme arbitre"
      );

      // Un REFEREE non assigné du tout n'a jamais ce droit, même sur un
      // tournoi dont il n'est pas l'organisateur.
      const unassignedReferee = { role: "REFEREE" as const, userId: "un-inconnu" };
      assert.equal(await canRecordResults(unassignedReferee, tournamentA), false);
    } finally {
      await prisma.tournamentReferee.deleteMany({ where: { tournamentId: tournamentA.id } });
      await prisma.tournament.deleteMany({ where: { id: { in: [tournamentA.id, tournamentB.id] } } });
      await prisma.user.deleteMany({
        where: { id: { in: [organizerA.id, organizerB.id, referee.id] } },
      });
      await prisma.$disconnect();
    }
  }
);
