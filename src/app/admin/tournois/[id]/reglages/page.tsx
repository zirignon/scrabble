import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import {
  updateAllowRematchesFromRoundAction,
  updateFinalPhaseSettingsAction,
  updateKnockoutTwoLegsAction,
  updateSwissRoundsSettingsAction,
  updateSwissSeedingAction,
  updateThirdPlaceSettingsAction,
} from "@/lib/actions/classic";

function FinalPhaseSettingsForm({
  tournamentId,
  finalPhaseEnabled,
  finalPhaseQualifiers,
  canManage,
}: {
  tournamentId: string;
  finalPhaseEnabled: boolean;
  finalPhaseQualifiers: number | null;
  canManage: boolean;
}) {
  return (
    <div className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 flex flex-col gap-2">
      <p className="text-sm font-medium">Phase finale (optionnelle)</p>
      {canManage ? (
        <form
          action={updateFinalPhaseSettingsAction.bind(null, tournamentId)}
          className="flex items-end gap-3"
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="finalPhaseEnabled"
              defaultChecked={finalPhaseEnabled}
              className="rounded border-black/20 dark:border-white/30"
            />
            Élimination directe après la phase principale
          </label>
          <div className="flex flex-col gap-1">
            <label htmlFor="finalPhaseQualifiers" className="text-xs font-medium">
              Nombre de qualifiés
            </label>
            <input
              id="finalPhaseQualifiers"
              name="finalPhaseQualifiers"
              type="number"
              min={2}
              defaultValue={finalPhaseQualifiers ?? ""}
              placeholder="4"
              className="w-24 rounded-md border-2 border-gold/40 dark:border-gold-light/40 px-3 py-2 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light text-sm focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-navy hover:bg-navy/90 text-white dark:bg-navy-light dark:hover:bg-navy-light/90 dark:text-navy px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Mettre à jour
          </button>
        </form>
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          {finalPhaseEnabled
            ? `Phase finale activée, ${finalPhaseQualifiers} qualifié(s).`
            : "Pas de phase finale pour ce tournoi."}
        </p>
      )}
    </div>
  );
}

function SwissRoundsSettingsForm({
  tournamentId,
  swissRoundsCount,
  roundsPlayed,
  canManage,
}: {
  tournamentId: string;
  swissRoundsCount: number | null;
  roundsPlayed: number;
  canManage: boolean;
}) {
  return (
    <div className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 flex flex-col gap-2">
      <p className="text-sm font-medium">Nombre de rondes (suisse)</p>
      {canManage ? (
        <form
          action={updateSwissRoundsSettingsAction.bind(null, tournamentId)}
          className="flex items-end gap-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="swissRoundsCount" className="text-xs font-medium">
              Rondes prévues avant la phase finale
            </label>
            <input
              id="swissRoundsCount"
              name="swissRoundsCount"
              type="number"
              min={1}
              defaultValue={swissRoundsCount ?? ""}
              placeholder="Illimité"
              className="w-28 rounded-md border-2 border-gold/40 dark:border-gold-light/40 px-3 py-2 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light text-sm focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-navy hover:bg-navy/90 text-white dark:bg-navy-light dark:hover:bg-navy-light/90 dark:text-navy px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Mettre à jour
          </button>
          <span className="rounded-md border-2 border-navy/30 dark:border-navy-light/40 bg-navy/10 dark:bg-navy-light/10 px-3 py-2 text-sm font-semibold text-navy dark:text-navy-light">
            {swissRoundsCount
              ? `Ronde ${roundsPlayed} / ${swissRoundsCount}`
              : `${roundsPlayed} ronde(s) générée(s)`}
          </span>
        </form>
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          {swissRoundsCount
            ? `${roundsPlayed} / ${swissRoundsCount} ronde(s) générée(s).`
            : `${roundsPlayed} ronde(s) générée(s), sans limite prédéfinie.`}
        </p>
      )}
    </div>
  );
}

function RematchSettingsForm({
  tournamentId,
  allowRematchesFromRound,
  canManage,
  isCombined,
}: {
  tournamentId: string;
  allowRematchesFromRound: number | null;
  canManage: boolean;
  isCombined: boolean;
}) {
  // Le numéro de ronde ci-dessous est toujours celui affiché à l'écran
  // ("Ronde N"), donc pour un tournoi Combiné les rondes de poules
  // comptent aussi dans ce numéro (voir Tournament.allowRematchesFromRound).
  const numberingHint = isCombined ? " (numérotation globale, poules incluses)" : "";
  return (
    <div className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 flex flex-col gap-2">
      <p className="text-sm font-medium">Revanches (suisse)</p>
      {canManage ? (
        <form
          action={updateAllowRematchesFromRoundAction.bind(null, tournamentId)}
          className="flex items-end gap-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="allowRematchesFromRound" className="text-xs font-medium">
              Autoriser les revanches à partir de la ronde{numberingHint}
            </label>
            <input
              id="allowRematchesFromRound"
              name="allowRematchesFromRound"
              type="number"
              min={1}
              defaultValue={allowRematchesFromRound ?? ""}
              placeholder="Jamais"
              className="w-28 rounded-md border-2 border-gold/40 dark:border-gold-light/40 px-3 py-2 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light text-sm focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-navy hover:bg-navy/90 text-white dark:bg-navy-light dark:hover:bg-navy-light/90 dark:text-navy px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Mettre à jour
          </button>
        </form>
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          {allowRematchesFromRound
            ? `Revanches autorisées à partir de la ronde ${allowRematchesFromRound}${numberingHint}.`
            : "Aucune revanche volontaire."}
        </p>
      )}
    </div>
  );
}

const swissSeedingLabel: Record<string, string> = {
  RANDOM: "Tirage au sort",
  RATING: "Classement (Elo classique)",
};

function SwissSeedingSettingsForm({
  tournamentId,
  swissSeeding,
  roundsPlayed,
  canManage,
}: {
  tournamentId: string;
  swissSeeding: string;
  roundsPlayed: number;
  canManage: boolean;
}) {
  const roundOneGenerated = roundsPlayed > 0;
  return (
    <div className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 flex flex-col gap-2">
      <p className="text-sm font-medium">Appariement de la ronde 1</p>
      {canManage && !roundOneGenerated ? (
        <form
          action={updateSwissSeedingAction.bind(null, tournamentId)}
          className="flex items-end gap-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="swissSeeding" className="text-xs font-medium">
              Méthode
            </label>
            <select
              id="swissSeeding"
              name="swissSeeding"
              defaultValue={swissSeeding}
              className="rounded-md border-2 border-gold/40 dark:border-gold-light/40 px-3 py-2 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light text-sm focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
            >
              {Object.entries(swissSeedingLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-navy hover:bg-navy/90 text-white dark:bg-navy-light dark:hover:bg-navy-light/90 dark:text-navy px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Mettre à jour
          </button>
        </form>
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          {swissSeedingLabel[swissSeeding]}
          {roundOneGenerated && " — ronde 1 déjà générée, réglage figé."}
        </p>
      )}
    </div>
  );
}

function ThirdPlaceSettingsForm({
  tournamentId,
  thirdPlaceMatchEnabled,
  canManage,
}: {
  tournamentId: string;
  thirdPlaceMatchEnabled: boolean;
  canManage: boolean;
}) {
  return (
    <div className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 flex flex-col gap-2">
      <p className="text-sm font-medium">Match pour la 3ᵉ place (optionnel)</p>
      {canManage ? (
        <form
          action={updateThirdPlaceSettingsAction.bind(null, tournamentId)}
          className="flex items-end gap-3"
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="thirdPlaceMatchEnabled"
              defaultChecked={thirdPlaceMatchEnabled}
              className="rounded border-black/20 dark:border-white/30"
            />
            Opposer les deux perdants de demi-finale
          </label>
          <button
            type="submit"
            className="rounded-md bg-navy hover:bg-navy/90 text-white dark:bg-navy-light dark:hover:bg-navy-light/90 dark:text-navy px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Mettre à jour
          </button>
        </form>
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          {thirdPlaceMatchEnabled
            ? "Match pour la 3e place activé."
            : "Pas de match pour la 3e place pour ce tournoi."}
        </p>
      )}
    </div>
  );
}

function KnockoutTwoLegsSettingsForm({
  tournamentId,
  knockoutTwoLegs,
  canManage,
}: {
  tournamentId: string;
  knockoutTwoLegs: boolean;
  canManage: boolean;
}) {
  return (
    <div className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 flex flex-col gap-2">
      <p className="text-sm font-medium">Confrontations à élimination directe</p>
      {canManage ? (
        <form
          action={updateKnockoutTwoLegsAction.bind(null, tournamentId)}
          className="flex items-end gap-3"
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="knockoutTwoLegs"
              defaultChecked={knockoutTwoLegs}
              className="rounded border-black/20 dark:border-white/30"
            />
            2 manches (aller-retour) + belle en cas d&apos;égalité
          </label>
          <button
            type="submit"
            className="rounded-md bg-navy hover:bg-navy/90 text-white dark:bg-navy-light dark:hover:bg-navy-light/90 dark:text-navy px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Mettre à jour
          </button>
        </form>
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          {knockoutTwoLegs
            ? "Confrontations en 2 manches + belle si égalité."
            : "Confrontations en un seul match."}
        </p>
      )}
    </div>
  );
}

export default async function TournamentSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole(STAFF_ROLES);

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      rounds: { select: { isFinalPhase: true, isSwissPhase: true } },
    },
  });
  if (!tournament || tournament.type !== "CLASSIC") notFound();

  const canManage = canManageTournament(session, tournament.organizerId);
  const mainPhaseRounds = tournament.rounds.filter((r) => !r.isFinalPhase);
  const swissPhaseRounds = tournament.rounds.filter((r) => r.isSwissPhase);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/admin/tournois/${tournament.id}`}
          className="text-sm text-black/60 dark:text-white/60 hover:underline"
        >
          ← Retour au tournoi
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-navy dark:text-navy-light mt-1">
          Réglages — {tournament.name}
        </h1>
        <Link
          href={`/admin/tournois/${tournament.id}/rondes`}
          className="text-sm text-emerald-700 dark:text-emerald-400 underline mt-1 inline-block"
        >
          Voir les rondes et résultats →
        </Link>
      </div>

      {tournament.format === "SWISS" && (
        <SwissSeedingSettingsForm
          tournamentId={tournament.id}
          swissSeeding={tournament.swissSeeding}
          roundsPlayed={mainPhaseRounds.length}
          canManage={canManage}
        />
      )}

      {(tournament.format === "SWISS" || tournament.format === "COMBINED") && (
        <SwissRoundsSettingsForm
          tournamentId={tournament.id}
          swissRoundsCount={tournament.swissRoundsCount}
          roundsPlayed={tournament.format === "COMBINED" ? swissPhaseRounds.length : mainPhaseRounds.length}
          canManage={canManage}
        />
      )}

      {(tournament.format === "SWISS" || tournament.format === "COMBINED") && (
        <RematchSettingsForm
          tournamentId={tournament.id}
          allowRematchesFromRound={tournament.allowRematchesFromRound}
          canManage={canManage}
          isCombined={tournament.format === "COMBINED"}
        />
      )}

      {(tournament.format === "ROUND_ROBIN" ||
        tournament.format === "SWISS" ||
        tournament.format === "COMBINED") && (
        <FinalPhaseSettingsForm
          tournamentId={tournament.id}
          finalPhaseEnabled={tournament.finalPhaseEnabled}
          finalPhaseQualifiers={tournament.finalPhaseQualifiers}
          canManage={canManage}
        />
      )}

      <ThirdPlaceSettingsForm
        tournamentId={tournament.id}
        thirdPlaceMatchEnabled={tournament.thirdPlaceMatchEnabled}
        canManage={canManage}
      />

      {!tournament.isTeamEvent && (
        <KnockoutTwoLegsSettingsForm
          tournamentId={tournament.id}
          knockoutTwoLegs={tournament.knockoutTwoLegs}
          canManage={canManage}
        />
      )}
    </div>
  );
}
