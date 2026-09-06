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
  generateSwissPhaseRoundAction,
  generateTeamFinalPhaseFromPoolsAction,
  generateTeamFinalPhaseFromStandingsAction,
  generateTeamKnockoutBracketAction,
  generateTeamPoolsRoundRobinAction,
  generateTeamRoundRobinAction,
  generateTeamSwissPhaseRoundAction,
  recordMatchResultAction,
} from "@/lib/actions/classic";
import { countKnockoutEntrants, getKnockoutStageLabel, getTeamEncounterResult } from "@/lib/classic/knockout";
import { RoundActionButton } from "@/components/admin/RoundActionButton";
import {
  AutoSubmitScoreInput,
  AutoSubmitStatusSelect,
  SavingIndicator,
} from "@/components/admin/AutoSaveMatchScore";
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

// Export PDF ciblé sur une seule ronde (ou tout un tour aller/retour/belle
// via le numéro de sa manche aller — voir ?ronde= dans
// rondes/export/pdf/route.ts, qui regroupe alors automatiquement les
// manches associées) et instantané du classement "tel qu'il était juste
// après cette ronde" (?ronde= sur classement/export/pdf, même principe côté
// individuel et équipes) — plutôt que les exports globaux déjà proposés
// plus haut sur la page.
function RoundExportLinks({
  tournamentId,
  roundNumber,
  isTeamEvent,
}: {
  tournamentId: string;
  roundNumber: number;
  isTeamEvent: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <a
        href={`/api/tournois/${tournamentId}/rondes/export/pdf?ronde=${roundNumber}`}
        className="text-navy dark:text-navy-light underline underline-offset-2"
      >
        Exporter cette ronde →
      </a>
      <a
        href={`/api/tournois/${tournamentId}/classement/${isTeamEvent ? "equipes/" : ""}export/pdf?ronde=${roundNumber}`}
        className="text-navy dark:text-navy-light underline underline-offset-2"
      >
        Exporter le classement après cette ronde →
      </a>
    </div>
  );
}

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
  // (colonne "Score", entre Domicile et Extérieur) ; le statut vit dans une
  // cellule séparée, plus loin, mais y est rattaché via l'attribut form=
  // plutôt que par imbrication DOM — ce qui permet de placer le nom de
  // l'adversaire (Extérieur) avant lui dans l'ordre des colonnes tout en
  // gardant une seule soumission. Le score s'enregistre automatiquement dès
  // qu'un champ perd le focus ou que le statut change (voir
  // AutoSaveMatchScore) : plus besoin d'un clic sur "OK".
  const formId = `match-form-${match.id}`;
  // Par équipes, homeStarts alterne d'un échiquier à l'autre au sein d'une
  // même confrontation (voir createTeamEncounterMatches) pour équilibrer
  // qui débute la partie ; le joueur qui débute est toujours affiché à
  // gauche (colonne Domicile), quel que soit homeTeamId/awayTeamId réel —
  // ces derniers restent inchangés pour ne pas casser le calcul du
  // classement par équipes, qui en dépend.
  const homeScoreInput = (
    <AutoSubmitScoreInput
      name="homeScore"
      defaultValue={match.homeScore ?? ""}
      className="w-14 rounded border-2 border-gold/40 dark:border-gold-light/40 px-1.5 py-1 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
    />
  );
  const awayScoreInput = (
    <AutoSubmitScoreInput
      name="awayScore"
      defaultValue={match.awayScore ?? ""}
      className="w-14 rounded border-2 border-gold/40 dark:border-gold-light/40 px-1.5 py-1 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
    />
  );
  // Un exempt est un vrai appariement contre X (voir BYE_HOME_SCORE dans
  // classic.ts) : on affiche "X" plutôt qu'un tiret pour le côté sans
  // adversaire réel.
  const opponentPlaceholder = match.isBye ? "X" : "—";
  const leftName = match.homeStarts
    ? match.homePlayer
      ? `${match.homePlayer.lastName} ${match.homePlayer.firstName}`
      : opponentPlaceholder
    : match.awayPlayer
      ? `${match.awayPlayer.lastName} ${match.awayPlayer.firstName}`
      : opponentPlaceholder;
  const rightName = match.homeStarts
    ? match.awayPlayer
      ? `${match.awayPlayer.lastName} ${match.awayPlayer.firstName}`
      : opponentPlaceholder
    : match.homePlayer
      ? `${match.homePlayer.lastName} ${match.homePlayer.firstName}`
      : opponentPlaceholder;
  const leftScore = match.homeStarts ? match.homeScore : match.awayScore;
  const rightScore = match.homeStarts ? match.awayScore : match.homeScore;
  return (
      <tr className="border-b border-black/5 dark:border-white/5">
        <td className="py-2 pr-4">{match.table ?? "—"}</td>
        <td className="py-2 pr-4 truncate">{leftName}</td>
        <td className="py-2 pr-4 text-center">
          {match.isBye ? (
            <span className="text-black/50 dark:text-white/50">
              {leftScore ?? "-"} - {rightScore ?? "-"}
            </span>
          ) : canManage ? (
            <form
              id={formId}
              action={recordMatchResultAction.bind(null, tournamentId, match.id)}
              className="flex flex-nowrap items-center justify-center gap-1"
            >
              {match.homeStarts ? homeScoreInput : awayScoreInput}
              <span>-</span>
              {match.homeStarts ? awayScoreInput : homeScoreInput}
              <SavingIndicator />
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
              <AutoSubmitStatusSelect
                formId={formId}
                defaultValue={match.status}
                className="rounded border border-black/10 dark:border-white/20 px-1 py-1 bg-transparent text-xs"
              >
                {Object.entries(statusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </AutoSubmitStatusSelect>
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

type RoundWithRelations = {
  id: string;
  number: number;
  isFinalPhase: boolean;
  isSwissPhase: boolean;
  knockoutLeg: number | null;
  knockoutStage: number | null;
  matches: MatchWithRelations[];
};

interface KnockoutConfrontation {
  table: number | null;
  isBye: boolean;
  homePlayer: Player | null;
  awayPlayer: Player | null;
  // Score de l'exempt contre X (voir BYE_HOME_SCORE dans classic.ts) —
  // uniquement renseigné quand isBye est vrai.
  byeScore?: { home: number | null; away: number | null };
  // Un élément par manche existante pour ce tour (voir legLabels) : aller,
  // retour, belle — null quand cette confrontation précise n'a pas (ou plus
  // besoin d')une manche donnée (ex. tranchée 2-0, pas de belle générée).
  legs: (MatchWithRelations | null)[];
}

// Regroupe les rondes d'un même tour joué en 2 manches + belle (voir
// Tournament.knockoutTwoLegs) en une confrontation par paire de joueurs,
// pour un affichage compact façon feuille de match (une ligne par
// confrontation, une colonne par manche) plutôt que 2-3 tableaux distincts
// empilés. N'est appelé que lorsque au moins 2 manches existent déjà pour
// le tour (voir buildKnockoutRenderUnits) : avec une seule manche générée,
// rien à regrouper, le rendu classique à ronde unique suffit.
function buildKnockoutConfrontations(legRounds: RoundWithRelations[]): {
  confrontations: KnockoutConfrontation[];
  legLabels: string[];
} {
  const leg1 = legRounds.find((r) => r.knockoutLeg === 1);
  const leg2 = legRounds.find((r) => r.knockoutLeg === 2);
  const belle = legRounds.find((r) => r.knockoutLeg === 3);
  if (!leg1) return { confrontations: [], legLabels: [] };

  const legLabels = belle ? ["Aller", "Retour", "Belle"] : leg2 ? ["Aller", "Retour"] : ["Aller"];
  const confrontations = leg1.matches
    .filter((m) => !m.isThirdPlace)
    .map((m1): KnockoutConfrontation => {
      if (m1.isBye || !m1.homePlayerId || !m1.awayPlayerId) {
        return {
          table: m1.table,
          isBye: true,
          homePlayer: m1.homePlayer,
          awayPlayer: m1.awayPlayer,
          byeScore: { home: m1.homeScore, away: m1.awayScore },
          legs: [],
        };
      }
      const m2 =
        leg2?.matches.find(
          (m) => m.homePlayerId === m1.homePlayerId && m.awayPlayerId === m1.awayPlayerId
        ) ?? null;
      const mb =
        belle?.matches.find(
          (m) => m.homePlayerId === m1.homePlayerId && m.awayPlayerId === m1.awayPlayerId
        ) ?? null;
      return {
        table: m1.table,
        isBye: false,
        homePlayer: m1.homePlayer,
        awayPlayer: m1.awayPlayer,
        legs: [m1, m2, mb].slice(0, legLabels.length),
      };
    });
  return { confrontations, legLabels };
}

type RenderUnit =
  | { kind: "single"; round: RoundWithRelations }
  | { kind: "stage"; knockoutStage: number; legRounds: RoundWithRelations[] };

// Regroupe les rondes aller/retour/belle d'un même tour (même knockoutStage)
// en une seule unité "stage" à condition qu'au moins 2 manches existent déjà
// (sinon rien à regrouper — voir buildKnockoutConfrontations) ; toute autre
// ronde (poules, phase suisse, tableau à élimination directe classique en un
// seul match) reste une unité "single" inchangée.
function buildKnockoutRenderUnits(rounds: RoundWithRelations[]): RenderUnit[] {
  const units: RenderUnit[] = [];
  const seenStages = new Set<number>();
  for (const round of rounds) {
    if (round.knockoutStage !== null) {
      if (seenStages.has(round.knockoutStage)) continue;
      seenStages.add(round.knockoutStage);
      const legRounds = rounds.filter((r) => r.knockoutStage === round.knockoutStage);
      if (legRounds.length >= 2) {
        units.push({ kind: "stage", knockoutStage: round.knockoutStage, legRounds });
        continue;
      }
      units.push({ kind: "single", round });
      continue;
    }
    units.push({ kind: "single", round });
  }
  return units;
}

// Cellule de score d'une manche donnée pour une confrontation du tableau à
// élimination directe en 2 manches + belle — un tiret tant que cette manche
// n'existe pas encore pour cette confrontation précise (ex. tranchée 2-0,
// pas de belle nécessaire).
function LegScoreCell({
  match,
  canManage,
  tournamentId,
}: {
  match: MatchWithRelations | null;
  canManage: boolean;
  tournamentId: string;
}) {
  if (!match) {
    return (
      <td className="py-2 px-2 text-center text-black/30 dark:text-white/30">—</td>
    );
  }
  if (!canManage) {
    return (
      <td className="py-2 px-2 text-center whitespace-nowrap">
        {match.homeScore ?? "-"} - {match.awayScore ?? "-"}
      </td>
    );
  }
  const formId = `leg-form-${match.id}`;
  return (
    <td className="py-2 px-2">
      <form
        id={formId}
        action={recordMatchResultAction.bind(null, tournamentId, match.id)}
        className="flex flex-col items-center gap-1"
      >
        <div className="flex items-center gap-1">
          <AutoSubmitScoreInput
            name="homeScore"
            defaultValue={match.homeScore ?? ""}
            className="w-12 rounded border-2 border-gold/40 dark:border-gold-light/40 px-1 py-0.5 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light text-xs focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
          />
          <span>-</span>
          <AutoSubmitScoreInput
            name="awayScore"
            defaultValue={match.awayScore ?? ""}
            className="w-12 rounded border-2 border-gold/40 dark:border-gold-light/40 px-1 py-0.5 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light text-xs focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
          />
          <SavingIndicator />
        </div>
        <div className="flex items-center gap-1">
          <AutoSubmitStatusSelect
            formId={formId}
            defaultValue={match.status}
            className="rounded border border-black/10 dark:border-white/20 px-1 py-0.5 bg-transparent text-[10px]"
          >
            {Object.entries(statusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </AutoSubmitStatusSelect>
        </div>
      </form>
    </td>
  );
}

function KnockoutConfrontationsTable({
  confrontations,
  legLabels,
  canManage,
  tournamentId,
}: {
  confrontations: KnockoutConfrontation[];
  legLabels: string[];
  canManage: boolean;
  tournamentId: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pr-4">Table</th>
            <th className="py-2 pr-4">Domicile</th>
            {legLabels.map((label) => (
              <th key={label} className="py-2 px-2 text-center whitespace-nowrap">
                {label}
              </th>
            ))}
            <th className="py-2 pl-3">Extérieur</th>
          </tr>
        </thead>
        <tbody>
          {confrontations.map((c, i) => {
            const homeName = c.homePlayer ? `${c.homePlayer.lastName} ${c.homePlayer.firstName}` : "—";
            const awayName = c.awayPlayer
              ? `${c.awayPlayer.lastName} ${c.awayPlayer.firstName}`
              : c.isBye
                ? "X"
                : "—";
            return (
              <tr key={i} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-4">{c.table ?? "—"}</td>
                <td className="py-2 pr-4 truncate">{homeName}</td>
                {c.isBye ? (
                  <td
                    colSpan={legLabels.length}
                    className="py-2 px-2 text-center text-black/50 dark:text-white/50"
                  >
                    {c.byeScore?.home ?? "-"} - {c.byeScore?.away ?? "-"} (exempt)
                  </td>
                ) : (
                  legLabels.map((label, i2) => (
                    <LegScoreCell
                      key={label}
                      match={c.legs[i2] ?? null}
                      canManage={canManage}
                      tournamentId={tournamentId}
                    />
                  ))
                )}
                <td className="py-2 pl-3 truncate">{awayName}</td>
              </tr>
            );
          })}
          {confrontations.length === 0 && (
            <tr>
              <td colSpan={3 + legLabels.length} className="py-3 text-black/50 dark:text-white/50">
                Aucune confrontation dans ce tour.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
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
  const generateSwissPhaseBound = generateSwissPhaseRoundAction.bind(null, tournament.id);
  const generateTeamSwissPhaseBound = generateTeamSwissPhaseRoundAction.bind(null, tournament.id);
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

  // Format Combiné (poules puis suisse, puis en option élimination directe) :
  // pour ce format, mainPhaseRounds/mainPhaseComplete ci-dessus désignent
  // déjà la phase de poules (isFinalPhase: false), et servent donc aussi de
  // garde-fou "poules terminées" avant de générer la phase suisse — mais le
  // décompte de rondes et l'existence d'un tableau final doivent être
  // recalculés séparément, la phase suisse ayant elle aussi isFinalPhase: true.
  const swissPhaseRounds = tournament.rounds.filter((r) => r.isSwissPhase);
  const swissPhaseComplete =
    swissPhaseRounds.length > 0 &&
    swissPhaseRounds.every((r) =>
      r.matches.every((m) => m.isBye || !m.homePlayerId || !m.awayPlayerId || m.status !== "SCHEDULED")
    );
  const swissPhaseRoundLimitReached =
    tournament.swissRoundsCount !== null && swissPhaseRounds.length >= tournament.swissRoundsCount;
  const knockoutAfterSwissExists = tournament.rounds.some((r) => r.isFinalPhase && !r.isSwissPhase);
  // Format 2 manches + belle (voir Tournament.knockoutTwoLegs) : après une
  // manche aller (knockoutLeg 1) avec au moins une vraie confrontation (pas
  // seulement des exempts), "générer le tour suivant" génère en réalité la
  // manche retour — le bouton l'annonce plutôt que de laisser croire qu'il
  // avance déjà au tour suivant du tableau.
  const lastRound = tournament.rounds.length > 0 ? tournament.rounds[tournament.rounds.length - 1] : null;
  const nextKnockoutRoundLabel =
    tournament.knockoutTwoLegs &&
    lastRound?.knockoutLeg === 1 &&
    lastRound.matches.some((m) => !m.isBye)
      ? "Générer la manche retour"
      : "Générer le tour suivant";
  // Regroupe les rondes aller/retour/belle d'un même tour dès qu'au moins 2
  // manches existent (voir buildKnockoutRenderUnits), pour l'affichage
  // compact façon feuille de match ci-dessous.
  const renderUnits = buildKnockoutRenderUnits(tournament.rounds);

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
            href={`/tournois/${tournament.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-emerald-700 dark:text-emerald-400 underline"
          >
            Voir la page publique ↗
          </Link>
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
          <Link
            href={`/admin/tournois/${tournament.id}/reglages`}
            className="text-sm text-emerald-700 dark:text-emerald-400 underline"
          >
            Réglages →
          </Link>
        </div>
      </div>

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
            (tournament.format === "GROUPS" || tournament.format === "COMBINED") &&
            tournament.rounds.length === 0 && (
              <RoundActionButton
                action={generatePoolsBound}
                label="Générer les rondes en poules"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {tournament.isTeamEvent &&
            (tournament.format === "GROUPS" || tournament.format === "COMBINED") &&
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
            tournament.format === "COMBINED" &&
            mainPhaseComplete &&
            !swissPhaseRoundLimitReached &&
            !knockoutAfterSwissExists && (
              <RoundActionButton
                action={generateSwissPhaseBound}
                label="Générer la ronde suisse suivante"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {tournament.isTeamEvent &&
            tournament.format === "COMBINED" &&
            mainPhaseComplete &&
            !swissPhaseRoundLimitReached &&
            !knockoutAfterSwissExists && (
              <RoundActionButton
                action={generateTeamSwissPhaseBound}
                label="Générer la ronde suisse suivante (équipes)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {tournament.format === "COMBINED" && swissPhaseRoundLimitReached && !knockoutAfterSwissExists && (
            <p className="text-sm text-black/60 dark:text-white/60 self-center">
              Nombre de rondes suisses prévu atteint — générez la phase
              finale ci-dessous, ou augmentez le nombre de rondes plus haut
              pour en ajouter une de plus.
            </p>
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
            tournament.format === "COMBINED" &&
            tournament.finalPhaseEnabled &&
            swissPhaseComplete &&
            !knockoutAfterSwissExists && (
              <RoundActionButton
                action={generateFinalPhaseFromStandingsBound}
                label="Générer la phase finale"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {tournament.isTeamEvent &&
            tournament.format === "COMBINED" &&
            tournament.finalPhaseEnabled &&
            swissPhaseComplete &&
            !knockoutAfterSwissExists && (
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
                finalPhaseFromStandingsExists) ||
              (tournament.format === "COMBINED" && knockoutAfterSwissExists)) && (
              <RoundActionButton
                action={generateNextKnockoutBound}
                label={nextKnockoutRoundLabel}
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
                finalPhaseFromStandingsExists) ||
              (tournament.format === "COMBINED" && knockoutAfterSwissExists)) && (
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

      {renderUnits.map((unit) => {
        if (unit.kind === "stage") {
          // Tour joué en 2 manches + belle (voir Tournament.knockoutTwoLegs,
          // individuel uniquement — les rondes par équipes n'ont jamais de
          // knockoutStage) : une confrontation par ligne, une colonne par
          // manche, plutôt que 2-3 tableaux distincts empilés.
          const leg1 = unit.legRounds.find((r) => r.knockoutLeg === 1)!;
          const { confrontations, legLabels } = buildKnockoutConfrontations(unit.legRounds);
          const thirdPlaceMatches = unit.legRounds.flatMap((r) =>
            r.matches.filter((m) => m.isThirdPlace)
          );
          return (
            <section
              key={unit.knockoutStage}
              id={`ronde-${leg1.number}`}
              className="flex flex-col gap-3 scroll-mt-20"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-lg font-semibold">
                  <a href={`#ronde-${leg1.number}`} className="hover:underline">
                    {getKnockoutStageLabel(
                      countKnockoutEntrants(leg1.matches.filter((m) => !m.isThirdPlace))
                    )}
                  </a>
                </h2>
                <RoundExportLinks tournamentId={tournament.id} roundNumber={leg1.number} isTeamEvent={false} />
              </div>
              <KnockoutConfrontationsTable
                confrontations={confrontations}
                legLabels={legLabels}
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
            </section>
          );
        }

        const round = unit.round;
        const roundHasPoolMatches = round.matches.some((m) => m.poolId);

        if (
          !tournament.isTeamEvent &&
          (tournament.format === "GROUPS" || tournament.format === "COMBINED") &&
          roundHasPoolMatches
        ) {
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
            <section key={round.id} id={`ronde-${round.number}`} className="flex flex-col gap-5 scroll-mt-20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-lg font-semibold">
                  <a href={`#ronde-${round.number}`} className="hover:underline">
                    Ronde {round.number}
                  </a>
                </h2>
                <RoundExportLinks tournamentId={tournament.id} roundNumber={round.number} isTeamEvent={false} />
              </div>
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
            (round.isFinalPhase && !round.isSwissPhase);
          const mainMatches = round.matches.filter((m) => !m.isThirdPlace);
          const thirdPlaceMatches = round.matches.filter((m) => m.isThirdPlace);
          return (
            <section key={round.id} id={`ronde-${round.number}`} className="flex flex-col gap-3 scroll-mt-20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-lg font-semibold">
                  <a href={`#ronde-${round.number}`} className="hover:underline">
                    {isKnockoutRound
                      ? getKnockoutStageLabel(countKnockoutEntrants(mainMatches))
                      : `Ronde ${round.number}`}
                  </a>
                </h2>
                <RoundExportLinks tournamentId={tournament.id} roundNumber={round.number} isTeamEvent={false} />
              </div>
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

        if (
          (tournament.format === "GROUPS" || tournament.format === "COMBINED") &&
          roundHasPoolMatches
        ) {
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
            <section key={round.id} id={`ronde-${round.number}`} className="flex flex-col gap-6 scroll-mt-20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-lg font-semibold">
                  <a href={`#ronde-${round.number}`} className="hover:underline">
                    Ronde {round.number}
                  </a>
                </h2>
                <RoundExportLinks tournamentId={tournament.id} roundNumber={round.number} isTeamEvent={true} />
              </div>
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
                      {match.homeTeam?.name} vs X : {match.homeScore ?? "-"} - {match.awayScore ?? "-"} (exempt)
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
          tournament.format === "KNOCKOUT" ||
          tournament.format === "GROUPS" ||
          (round.isFinalPhase && !round.isSwissPhase);
        return (
          <section key={round.id} id={`ronde-${round.number}`} className="flex flex-col gap-5 scroll-mt-20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-semibold">
                <a href={`#ronde-${round.number}`} className="hover:underline">
                  {isKnockoutRound
                    ? getKnockoutStageLabel(
                        countKnockoutEntrants([...encounters.values()].flatMap((e) => e.matches))
                      )
                    : `Ronde ${round.number}`}
                </a>
              </h2>
              <RoundExportLinks tournamentId={tournament.id} roundNumber={round.number} isTeamEvent={true} />
            </div>

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
                {match.homeTeam?.name} vs X : {match.homeScore ?? "-"} - {match.awayScore ?? "-"} (exempt)
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
