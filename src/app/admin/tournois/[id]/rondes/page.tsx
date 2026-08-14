import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import {
  addManualRoundAction,
  addMatchAction,
  generateFinalPhaseFromPoolsAction,
  generateFinalPhaseFromStandingsAction,
  generateKnockoutBracketAction,
  generateNextKnockoutRoundAction,
  generateNextSwissRoundAction,
  generateNextTeamKnockoutRoundAction,
  generateNextTeamSwissRoundAction,
  generatePoolsRoundRobinAction,
  generateRoundRobinAction,
  generateTeamFinalPhaseFromPoolsAction,
  generateTeamFinalPhaseFromStandingsAction,
  generateTeamKnockoutBracketAction,
  generateTeamPoolsRoundRobinAction,
  generateTeamRoundRobinAction,
  recordMatchResultAction,
  updateFinalPhaseSettingsAction,
  updateSwissRoundsSettingsAction,
  updateSwissSeedingAction,
  updateThirdPlaceSettingsAction,
} from "@/lib/actions/classic";
import { countKnockoutEntrants, getKnockoutStageLabel, getTeamEncounterResult } from "@/lib/classic/knockout";
import { RoundActionButton } from "@/components/admin/RoundActionButton";
import type { Match, Player, Pool, Team } from "@prisma/client";

const statusLabel: Record<string, string> = {
  SCHEDULED: "À jouer",
  PLAYED: "Joué",
  FORFEIT_HOME: "Forfait (domicile)",
  FORFEIT_AWAY: "Forfait (extérieur)",
  FORFEIT_BOTH: "Forfait (double)",
  CANCELLED: "Annulé",
};

type MatchWithRelations = Match & {
  homePlayer: Player | null;
  awayPlayer: Player | null;
  homeTeam: Team | null;
  awayTeam: Team | null;
  pool: Pool | null;
};


function MatchRow({
  match,
  canManage,
  tournamentId,
}: {
  match: MatchWithRelations;
  canManage: boolean;
  tournamentId: string;
}) {
  // Le formulaire de saisie du score n'entoure que les deux champs de score
  // (colonne "Score", entre Domicile et Extérieur) ; le statut et le bouton
  // OK vivent dans une cellule séparée, plus loin, mais y sont rattachés via
  // l'attribut form= plutôt que par imbrication DOM — ce qui permet de
  // placer le nom de l'adversaire (Extérieur) avant eux dans l'ordre des
  // colonnes tout en gardant une seule soumission.
  const formId = `match-form-${match.id}`;
  // Par équipes, homeStarts alterne d'un échiquier à l'autre au sein d'une
  // même confrontation (voir createTeamEncounterMatches) pour équilibrer
  // qui débute la partie ; le joueur qui débute est toujours affiché à
  // gauche (colonne Domicile), quel que soit homeTeamId/awayTeamId réel —
  // ces derniers restent inchangés pour ne pas casser le calcul du
  // classement par équipes, qui en dépend.
  const homeScoreInput = (
    <input
      type="number"
      name="homeScore"
      defaultValue={match.homeScore ?? ""}
      className="w-14 rounded border-2 border-gold/40 dark:border-gold-light/40 px-1.5 py-1 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
    />
  );
  const awayScoreInput = (
    <input
      type="number"
      name="awayScore"
      defaultValue={match.awayScore ?? ""}
      className="w-14 rounded border-2 border-gold/40 dark:border-gold-light/40 px-1.5 py-1 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
    />
  );
  const leftName = match.homeStarts
    ? match.homePlayer
      ? `${match.homePlayer.lastName} ${match.homePlayer.firstName}`
      : "—"
    : match.awayPlayer
      ? `${match.awayPlayer.lastName} ${match.awayPlayer.firstName}`
      : "—";
  const rightName = match.homeStarts
    ? match.awayPlayer
      ? `${match.awayPlayer.lastName} ${match.awayPlayer.firstName}`
      : "—"
    : match.homePlayer
      ? `${match.homePlayer.lastName} ${match.homePlayer.firstName}`
      : "—";
  const leftScore = match.homeStarts ? match.homeScore : match.awayScore;
  const rightScore = match.homeStarts ? match.awayScore : match.homeScore;
  return (
      <tr className="border-b border-black/5 dark:border-white/5">
        <td className="py-2 pr-4">{match.table ?? "—"}</td>
        <td className="py-2 pr-4 truncate">{leftName}</td>
        <td className="py-2 pr-4 text-center">
          {match.isBye ? (
            <span className="text-black/50 dark:text-white/50">—</span>
          ) : canManage ? (
            <form
              id={formId}
              action={recordMatchResultAction.bind(null, tournamentId, match.id)}
              className="flex flex-nowrap items-center justify-center gap-1"
            >
              {match.homeStarts ? homeScoreInput : awayScoreInput}
              <span>-</span>
              {match.homeStarts ? awayScoreInput : homeScoreInput}
            </form>
          ) : (
            <span>
              {leftScore ?? "-"} - {rightScore ?? "-"}
            </span>
          )}
        </td>
        <td className="py-2 pl-3 pr-4 truncate">{rightName}</td>
        <td className="py-2 pl-3 pr-4">
          {match.isBye ? (
            <span className="text-black/50 dark:text-white/50">Exempt (bye)</span>
          ) : canManage ? (
            <div className="flex flex-wrap items-center gap-1">
              <select
                form={formId}
                name="status"
                defaultValue={match.status}
                className="rounded border border-black/10 dark:border-white/20 px-1 py-1 bg-transparent text-xs"
              >
                {Object.entries(statusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                form={formId}
                type="submit"
                className="rounded bg-emerald-700 text-white px-2 py-1 text-xs"
              >
                OK
              </button>
            </div>
          ) : (
            <span>{statusLabel[match.status]}</span>
          )}
        </td>
      </tr>
  );
}

// table-fixed avec des largeurs de colonne explicites (identiques d'une
// carte à l'autre) : chaque poule/confrontation ayant sa propre table
// indépendante, un table-layout auto laisserait chacune caler ses colonnes
// sur son propre contenu, décalant les colonnes d'une carte à l'autre.
function MatchTable({
  matches,
  canManage,
  tournamentId,
}: {
  matches: MatchWithRelations[];
  canManage: boolean;
  tournamentId: string;
}) {
  return (
    <table className="w-full text-sm border-collapse table-fixed">
      <thead>
        <tr className="text-left border-b border-black/10 dark:border-white/10">
          <th className="py-2 pr-4 w-[6%]">Table</th>
          <th className="py-2 pr-4 w-[18%]">Domicile</th>
          <th className="py-2 pr-4 w-[20%]">Score</th>
          <th className="py-2 pl-3 pr-4 w-[18%]">Extérieur</th>
          <th className="py-2 pl-3 pr-4 w-[38%]">Statut</th>
        </tr>
      </thead>
      <tbody>
        {matches.map((match) => (
          <MatchRow
            key={match.id}
            match={match}
            canManage={canManage}
            tournamentId={tournamentId}
          />
        ))}
        {matches.length === 0 && (
          <tr>
            <td colSpan={5} className="py-3 text-black/50 dark:text-white/50">
              Aucun match dans cette ronde.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// Affiche le vainqueur d'une confrontation d'équipes (à la majorité
// d'échiquiers gagnés) dès que tous ses échiquiers sont décidés, sans
// attendre que l'arbitre le calcule à la main.
function EncounterWinnerLabel({
  matches,
  homeTeam,
  awayTeam,
}: {
  matches: MatchWithRelations[];
  homeTeam: Team;
  awayTeam: Team;
}) {
  const result = getTeamEncounterResult(matches);
  if (!result) return null;
  const { homeBoardsWon, awayBoardsWon } = result;
  if (homeBoardsWon === awayBoardsWon) {
    return (
      <span className="text-xs font-semibold text-black/50 dark:text-white/50">
        Égalité ({homeBoardsWon}-{awayBoardsWon})
      </span>
    );
  }
  const winnerName = homeBoardsWon > awayBoardsWon ? homeTeam.name : awayTeam.name;
  const score =
    homeBoardsWon > awayBoardsWon
      ? `${homeBoardsWon}-${awayBoardsWon}`
      : `${awayBoardsWon}-${homeBoardsWon}`;
  return (
    <span className="text-xs font-semibold text-moss dark:text-moss-light">
      Vainqueur : {winnerName} ({score})
    </span>
  );
}

function FinalPhaseSettingsForm({
  tournamentId,
  finalPhaseEnabled,
  finalPhaseQualifiers,
  canManage,
}: {
  tournamentId: string;
  finalPhaseEnabled: boolean;
  finalPhaseQualifiers: number;
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
              defaultValue={finalPhaseQualifiers}
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
      <p className="text-xs text-black/50 dark:text-white/50">
        Une fois activée, la phase finale (élimination directe entre les N
        premiers du classement général) se génère depuis les boutons
        ci-dessous, une fois la phase principale terminée.
      </p>
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
      <p className="text-xs text-black/50 dark:text-white/50">
        Laissez vide pour générer les rondes une par une sans limite, comme
        avant. Une fois le nombre indiqué atteint, générez la phase finale
        (si activée) — vous pouvez toujours ajouter une ronde manuelle en
        plus si besoin.
      </p>
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
      <p className="text-xs text-black/50 dark:text-white/50">
        Avant la ronde 1, le classement (0 point partout) ne permet pas
        encore de départager les joueurs pour l&apos;appariement : tirage au
        sort équitable, ou classement par Elo classique décroissant (les
        joueurs sans Elo renseigné sont classés derniers). Sans effet à
        partir de la ronde 2.
      </p>
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
      <p className="text-xs text-black/50 dark:text-white/50">
        Se génère automatiquement, dans la même ronde que la finale, dès que
        les demi-finales sont terminées.
      </p>
    </div>
  );
}

export default async function RoundsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole(STAFF_ROLES);

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      rounds: {
        orderBy: { number: "asc" },
        include: {
          matches: {
            include: {
              homePlayer: true,
              awayPlayer: true,
              homeTeam: true,
              awayTeam: true,
              pool: true,
            },
            // Trié par id (ordre de création) plutôt que par table : en
            // tournoi par équipes, le numéro de table repart de 1 à chaque
            // confrontation (un par échiquier), donc plusieurs matchs
            // partagent le même numéro. Sans clé de tri stable pour
            // départager ces égalités, Postgres peut renvoyer les lignes
            // dans un ordre différent après une simple mise à jour de score
            // (MVCC), donnant l'impression que les tableaux changent de
            // place. L'id est monotone et ne change jamais.
            orderBy: { id: "asc" },
          },
        },
      },
      registrations: { include: { player: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!tournament || tournament.type !== "CLASSIC") notFound();

  const canManage = canManageTournament(session, tournament.organizerId);
  const players = tournament.registrations.map((r) => r.player);
  const generateBound = generateRoundRobinAction.bind(null, tournament.id);
  const generateTeamBound = generateTeamRoundRobinAction.bind(null, tournament.id);
  const generateSwissBound = generateNextSwissRoundAction.bind(null, tournament.id);
  const generateTeamSwissBound = generateNextTeamSwissRoundAction.bind(null, tournament.id);
  const generatePoolsBound = generatePoolsRoundRobinAction.bind(null, tournament.id);
  const generateTeamPoolsBound = generateTeamPoolsRoundRobinAction.bind(null, tournament.id);
  const generateKnockoutBound = generateKnockoutBracketAction.bind(null, tournament.id);
  const generateNextKnockoutBound = generateNextKnockoutRoundAction.bind(null, tournament.id);
  const generateTeamKnockoutBound = generateTeamKnockoutBracketAction.bind(null, tournament.id);
  const generateNextTeamKnockoutBound = generateNextTeamKnockoutRoundAction.bind(null, tournament.id);
  const generateFinalPhaseBound = generateFinalPhaseFromPoolsAction.bind(null, tournament.id);
  const generateTeamFinalPhaseBound = generateTeamFinalPhaseFromPoolsAction.bind(null, tournament.id);
  const generateFinalPhaseFromStandingsBound = generateFinalPhaseFromStandingsAction.bind(
    null,
    tournament.id
  );
  const generateTeamFinalPhaseFromStandingsBound = generateTeamFinalPhaseFromStandingsAction.bind(
    null,
    tournament.id
  );
  const addRoundBound = addManualRoundAction.bind(null, tournament.id);

  const poolMatchesExist = tournament.rounds.some((r) => r.matches.some((m) => m.poolId));
  const finalPhaseExists = tournament.rounds.some((r) => r.matches.some((m) => !m.poolId));

  const mainPhaseRounds = tournament.rounds.filter((r) => !r.isFinalPhase);
  const mainPhaseComplete =
    mainPhaseRounds.length > 0 &&
    mainPhaseRounds.every((r) =>
      r.matches.every((m) => m.isBye || !m.homePlayerId || !m.awayPlayerId || m.status !== "SCHEDULED")
    );
  const finalPhaseFromStandingsExists = tournament.rounds.some((r) => r.isFinalPhase);
  const swissRoundLimitReached =
    tournament.swissRoundsCount !== null && mainPhaseRounds.length >= tournament.swissRoundsCount;

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
          Rondes — {tournament.name}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
          <Link
            href={`/tournois/${tournament.slug}/affichage`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-emerald-700 dark:text-emerald-400 underline"
          >
            Ouvrir l&apos;écran public ↗
          </Link>
          <Link
            href={`/tournois/${tournament.slug}/classement`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-emerald-700 dark:text-emerald-400 underline"
          >
            Voir le classement ↗
          </Link>
          {canManage && tournament.rounds.length > 0 && (
            <a
              href={`/api/tournois/${tournament.id}/rondes/export/pdf`}
              className="text-sm text-emerald-700 dark:text-emerald-400 underline"
            >
              Exporter les rondes en PDF
            </a>
          )}
        </div>
      </div>

      {tournament.format === "SWISS" && (
        <SwissSeedingSettingsForm
          tournamentId={tournament.id}
          swissSeeding={tournament.swissSeeding}
          roundsPlayed={mainPhaseRounds.length}
          canManage={canManage}
        />
      )}

      {tournament.format === "SWISS" && (
        <SwissRoundsSettingsForm
          tournamentId={tournament.id}
          swissRoundsCount={tournament.swissRoundsCount}
          roundsPlayed={mainPhaseRounds.length}
          canManage={canManage}
        />
      )}

      {(tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") && (
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

      {canManage && (
        <div className="flex flex-wrap gap-3 items-start">
          {tournament.isTeamEvent &&
            tournament.format === "ROUND_ROBIN" &&
            tournament.rounds.length === 0 && (
              <RoundActionButton
                action={generateTeamBound}
                label="Générer les rondes par équipes (round-robin)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {!tournament.isTeamEvent &&
            tournament.format === "ROUND_ROBIN" &&
            tournament.rounds.length === 0 && (
              <RoundActionButton
                action={generateBound}
                label="Générer les rondes (round-robin)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {!tournament.isTeamEvent && tournament.format === "SWISS" && !swissRoundLimitReached && (
            <RoundActionButton
              action={generateSwissBound}
              label="Générer la ronde suisse suivante"
              className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
            />
          )}
          {tournament.isTeamEvent && tournament.format === "SWISS" && !swissRoundLimitReached && (
            <RoundActionButton
              action={generateTeamSwissBound}
              label="Générer la ronde suisse suivante (équipes)"
              className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
            />
          )}
          {tournament.format === "SWISS" && swissRoundLimitReached && (
            <p className="text-sm text-black/60 dark:text-white/60 self-center">
              Nombre de rondes prévu atteint — générez la phase finale
              ci-dessous, ou augmentez le nombre de rondes plus haut pour en
              ajouter une de plus.
            </p>
          )}
          {!tournament.isTeamEvent &&
            tournament.format === "GROUPS" &&
            tournament.rounds.length === 0 && (
              <RoundActionButton
                action={generatePoolsBound}
                label="Générer les rondes en poules"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {tournament.isTeamEvent &&
            tournament.format === "GROUPS" &&
            tournament.rounds.length === 0 && (
              <RoundActionButton
                action={generateTeamPoolsBound}
                label="Générer les rondes en poules (équipes)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {!tournament.isTeamEvent &&
            tournament.format === "GROUPS" &&
            poolMatchesExist &&
            !finalPhaseExists && (
              <RoundActionButton
                action={generateFinalPhaseBound}
                label="Générer la phase finale"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {tournament.isTeamEvent &&
            tournament.format === "GROUPS" &&
            poolMatchesExist &&
            !finalPhaseExists && (
              <RoundActionButton
                action={generateTeamFinalPhaseBound}
                label="Générer la phase finale (équipes)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {!tournament.isTeamEvent &&
            (tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") &&
            tournament.finalPhaseEnabled &&
            mainPhaseComplete &&
            !finalPhaseFromStandingsExists && (
              <RoundActionButton
                action={generateFinalPhaseFromStandingsBound}
                label="Générer la phase finale"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {tournament.isTeamEvent &&
            (tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") &&
            tournament.finalPhaseEnabled &&
            mainPhaseComplete &&
            !finalPhaseFromStandingsExists && (
              <RoundActionButton
                action={generateTeamFinalPhaseFromStandingsBound}
                label="Générer la phase finale (équipes)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {!tournament.isTeamEvent &&
            tournament.format === "KNOCKOUT" &&
            tournament.rounds.length === 0 && (
              <RoundActionButton
                action={generateKnockoutBound}
                label="Générer le tableau (élimination directe)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {!tournament.isTeamEvent &&
            ((tournament.format === "KNOCKOUT" && tournament.rounds.length > 0) ||
              (tournament.format === "GROUPS" && finalPhaseExists) ||
              ((tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") &&
                finalPhaseFromStandingsExists)) && (
              <RoundActionButton
                action={generateNextKnockoutBound}
                label="Générer le tour suivant"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {tournament.isTeamEvent &&
            tournament.format === "KNOCKOUT" &&
            tournament.rounds.length === 0 && (
              <RoundActionButton
                action={generateTeamKnockoutBound}
                label="Générer le tableau (élimination directe équipes)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {tournament.isTeamEvent &&
            ((tournament.format === "KNOCKOUT" && tournament.rounds.length > 0) ||
              (tournament.format === "GROUPS" && finalPhaseExists) ||
              ((tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") &&
                finalPhaseFromStandingsExists)) && (
              <RoundActionButton
                action={generateNextTeamKnockoutBound}
                label="Générer le tour suivant (équipes)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          <RoundActionButton
            action={addRoundBound}
            label="+ Ajouter une ronde manuelle"
            className="rounded-md bg-gold hover:bg-gold/90 text-white dark:bg-gold-light dark:hover:bg-gold-light/90 dark:text-navy px-4 py-2 text-sm font-medium transition-colors"
          />
        </div>
      )}

      {tournament.rounds.map((round) => {
        const roundHasPoolMatches = round.matches.some((m) => m.poolId);

        if (!tournament.isTeamEvent && tournament.format === "GROUPS" && roundHasPoolMatches) {
          // Tournoi en poules : regroupe les matchs de la ronde par poule
          // (chaque poule joue son propre round-robin interne). Une ronde
          // de la phase finale (générée à partir des qualifiés) n'a pas de
          // poule associée et tombe dans le rendu individuel classique.
          const byPool = new Map<string, { pool: Pool; matches: MatchWithRelations[] }>();
          for (const match of round.matches) {
            if (!match.pool) continue;
            if (!byPool.has(match.pool.id)) {
              byPool.set(match.pool.id, { pool: match.pool, matches: [] });
            }
            byPool.get(match.pool.id)!.matches.push(match);
          }

          return (
            <section key={round.id} className="flex flex-col gap-5">
              <h2 className="font-heading text-lg font-semibold">Ronde {round.number}</h2>
              {[...byPool.values()].map(({ pool, matches }) => (
                <div key={pool.id} className="flex flex-col gap-2">
                  <h3 className="font-medium text-sm">{pool.name}</h3>
                  <MatchTable
                    matches={matches}
                    canManage={canManage}
                    tournamentId={tournament.id}
                  />
                </div>
              ))}
              {byPool.size === 0 && (
                <p className="text-sm text-black/50 dark:text-white/50">
                  Aucun match dans cette ronde.
                </p>
              )}
            </section>
          );
        }

        if (!tournament.isTeamEvent) {
          const isKnockoutRound =
            tournament.format === "KNOCKOUT" ||
            tournament.format === "GROUPS" ||
            round.isFinalPhase;
          const mainMatches = round.matches.filter((m) => !m.isThirdPlace);
          const thirdPlaceMatches = round.matches.filter((m) => m.isThirdPlace);
          return (
            <section key={round.id} className="flex flex-col gap-3">
              <h2 className="font-heading text-lg font-semibold">
                {isKnockoutRound
                  ? getKnockoutStageLabel(countKnockoutEntrants(mainMatches))
                  : `Ronde ${round.number}`}
              </h2>
              <MatchTable
                matches={mainMatches}
                canManage={canManage}
                tournamentId={tournament.id}
              />
              {thirdPlaceMatches.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-navy dark:text-navy-light">
                    Match pour la 3ᵉ place
                  </h3>
                  <MatchTable
                    matches={thirdPlaceMatches}
                    canManage={canManage}
                    tournamentId={tournament.id}
                  />
                </div>
              )}
              {canManage && (
                <form
                  action={addMatchAction.bind(null, tournament.id, round.id)}
                  className="flex flex-wrap items-end gap-2"
                >
                  <select
                    name="homePlayerId"
                    required
                    className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
                  >
                    <option value="">Domicile...</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.lastName} {p.firstName}
                      </option>
                    ))}
                  </select>
                  <select
                    name="awayPlayerId"
                    required
                    className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
                  >
                    <option value="">Extérieur...</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.lastName} {p.firstName}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    name="table"
                    placeholder="Table"
                    className="w-20 rounded border-2 border-gold/40 dark:border-gold-light/40 px-2 py-1 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light text-sm focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded bg-gold hover:bg-gold/90 text-white dark:bg-gold-light dark:hover:bg-gold-light/90 dark:text-navy px-3 py-1.5 text-sm font-medium transition-colors"
                  >
                    + Match
                  </button>
                </form>
              )}
            </section>
          );
        }

        if (tournament.format === "GROUPS" && roundHasPoolMatches) {
          // Tournoi par équipes en poules : regroupe d'abord par poule, puis
          // par confrontation d'équipes à l'intérieur de chaque poule. Une
          // ronde de la phase finale n'a pas de poule associée et tombe
          // dans le rendu par confrontation d'équipes classique.
          const byPool = new Map<
            string,
            {
              pool: Pool;
              encounters: Map<string, { homeTeam: Team; awayTeam: Team; matches: MatchWithRelations[] }>;
              byes: MatchWithRelations[];
            }
          >();

          for (const match of round.matches) {
            if (!match.pool) continue;
            if (!byPool.has(match.pool.id)) {
              byPool.set(match.pool.id, { pool: match.pool, encounters: new Map(), byes: [] });
            }
            const entry = byPool.get(match.pool.id)!;
            if (match.isBye) {
              entry.byes.push(match);
              continue;
            }
            if (!match.homeTeam || !match.awayTeam) continue;
            const key = `${match.homeTeam.id}:${match.awayTeam.id}`;
            if (!entry.encounters.has(key)) {
              entry.encounters.set(key, {
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                matches: [],
              });
            }
            entry.encounters.get(key)!.matches.push(match);
          }

          return (
            <section key={round.id} className="flex flex-col gap-6">
              <h2 className="font-heading text-lg font-semibold">Ronde {round.number}</h2>
              {[...byPool.values()].map(({ pool, encounters, byes }) => (
                <div key={pool.id} className="flex flex-col gap-4">
                  <h3 className="font-medium text-sm">{pool.name}</h3>
                  {[...encounters.values()].map(({ homeTeam, awayTeam, matches }) => (
                    <div key={`${homeTeam.id}:${awayTeam.id}`} className="flex flex-col gap-2 pl-4">
                      <p className="text-sm font-medium flex flex-wrap items-center gap-2">
                        <span>
                          {homeTeam.name} vs {awayTeam.name}
                        </span>
                        <EncounterWinnerLabel matches={matches} homeTeam={homeTeam} awayTeam={awayTeam} />
                      </p>
                      <MatchTable
                        matches={matches}
                        canManage={canManage}
                        tournamentId={tournament.id}
                      />
                    </div>
                  ))}
                  {byes.map((match) => (
                    <p key={match.id} className="text-sm text-black/50 dark:text-white/50 pl-4">
                      {match.homeTeam?.name} : équipe exempte pour cette ronde.
                    </p>
                  ))}
                </div>
              ))}
              {byPool.size === 0 && (
                <p className="text-sm text-black/50 dark:text-white/50">
                  Aucun match dans cette ronde.
                </p>
              )}
            </section>
          );
        }

        // Tournoi par équipes : regroupe les échiquiers par confrontation
        // (paire d'équipes) et affiche à part les équipes exemptes. Le
        // match pour la 3e place (le cas échéant) est exclu du regroupement
        // principal pour ne pas fausser le décompte des entrants (et donc
        // l'étiquette du tour) et s'affiche à part, sous son propre titre.
        const encounters = new Map<
          string,
          { homeTeam: Team; awayTeam: Team; matches: MatchWithRelations[] }
        >();
        const byes: MatchWithRelations[] = [];
        let thirdPlaceEncounter: { homeTeam: Team; awayTeam: Team; matches: MatchWithRelations[] } | null =
          null;

        for (const match of round.matches) {
          if (match.isBye) {
            byes.push(match);
            continue;
          }
          if (!match.homeTeam || !match.awayTeam) continue;
          if (match.isThirdPlace) {
            if (!thirdPlaceEncounter) {
              thirdPlaceEncounter = { homeTeam: match.homeTeam, awayTeam: match.awayTeam, matches: [] };
            }
            thirdPlaceEncounter.matches.push(match);
            continue;
          }
          const key = `${match.homeTeam.id}:${match.awayTeam.id}`;
          if (!encounters.has(key)) {
            encounters.set(key, {
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              matches: [],
            });
          }
          encounters.get(key)!.matches.push(match);
        }

        const isKnockoutRound =
          tournament.format === "KNOCKOUT" || tournament.format === "GROUPS" || round.isFinalPhase;
        return (
          <section key={round.id} className="flex flex-col gap-5">
            <h2 className="font-heading text-lg font-semibold">
              {isKnockoutRound
                ? getKnockoutStageLabel(
                    countKnockoutEntrants([...encounters.values()].flatMap((e) => e.matches))
                  )
                : `Ronde ${round.number}`}
            </h2>

            {[...encounters.values()].map(({ homeTeam, awayTeam, matches }) => (
              <div key={`${homeTeam.id}:${awayTeam.id}`} className="flex flex-col gap-2">
                <h3 className="font-medium text-sm flex flex-wrap items-center gap-2">
                  <span>
                    {homeTeam.name} vs {awayTeam.name}
                  </span>
                  <EncounterWinnerLabel matches={matches} homeTeam={homeTeam} awayTeam={awayTeam} />
                </h3>
                <MatchTable
                  matches={matches}
                  canManage={canManage}
                  tournamentId={tournament.id}
                />
              </div>
            ))}

            {thirdPlaceEncounter && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-navy dark:text-navy-light flex flex-wrap items-center gap-2">
                  <span>
                    Match pour la 3ᵉ place — {thirdPlaceEncounter.homeTeam.name} vs{" "}
                    {thirdPlaceEncounter.awayTeam.name}
                  </span>
                  <EncounterWinnerLabel
                    matches={thirdPlaceEncounter.matches}
                    homeTeam={thirdPlaceEncounter.homeTeam}
                    awayTeam={thirdPlaceEncounter.awayTeam}
                  />
                </h3>
                <MatchTable
                  matches={thirdPlaceEncounter.matches}
                  canManage={canManage}
                  tournamentId={tournament.id}
                />
              </div>
            )}

            {byes.map((match) => (
              <p key={match.id} className="text-sm text-black/50 dark:text-white/50">
                {match.homeTeam?.name} : équipe exempte pour cette ronde.
              </p>
            ))}

            {encounters.size === 0 && byes.length === 0 && (
              <p className="text-sm text-black/50 dark:text-white/50">
                Aucun match dans cette ronde.
              </p>
            )}
          </section>
        );
      })}

      {tournament.rounds.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          Aucune ronde créée. Générez un round-robin ou ajoutez une ronde manuelle.
        </p>
      )}
    </div>
  );
}
