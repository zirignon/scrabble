import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { tournamentStatusLabel } from "@/lib/labels";
import { headRow, th, matchRow, matchCell, scoreCell, MatchStatusPill, PoolBadge, card } from "@/components/public/StatusPill";
import { countKnockoutEntrants, getKnockoutStageLabel, getTeamEncounterResult } from "@/lib/classic/knockout";

type RoundMatch = Prisma.MatchGetPayload<{
  include: { homePlayer: true; awayPlayer: true; homeTeam: true; awayTeam: true; pool: true };
}>;

const roundHeading = "font-heading text-lg font-semibold text-navy dark:text-navy-light";

// Affiche le vainqueur d'une confrontation d'équipes (à la majorité
// d'échiquiers gagnés) dès que tous ses échiquiers sont décidés.
function EncounterWinnerLabel({
  matches,
  homeTeamName,
  awayTeamName,
}: {
  matches: RoundMatch[];
  homeTeamName: string;
  awayTeamName: string;
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
  const winnerName = homeBoardsWon > awayBoardsWon ? homeTeamName : awayTeamName;
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

// Un tableau de confrontations, dans une carte bordée avec un en-tête de
// colonnes — factorisé car répété pour chaque ronde/poule/confrontation
// d'équipes de la page. `forceNotBye` : les tables ci-dessous représentent
// déjà les échiquiers d'une confrontation d'équipes précise (jamais un bye,
// géré séparément via la liste des équipes exemptes).
//
// table-fixed avec des largeurs de colonne explicites (identiques d'une
// carte à l'autre) : chaque confrontation ayant sa propre table
// indépendante, un table-layout auto laisserait chacune caler ses colonnes
// sur son propre contenu, décalant le "Score" d'une carte à l'autre.
function MatchTable({ matches, forceNotBye = false }: { matches: RoundMatch[]; forceNotBye?: boolean }) {
  return (
    <div className={`overflow-hidden ${card}`}>
      <table className="w-full text-sm border-collapse table-fixed">
        <thead>
          <tr className={headRow}>
            <th className={`${th} w-[34%] pl-4`}>Domicile</th>
            <th className={`${th} w-[20%] text-center`}>Score</th>
            <th className={`${th} w-[34%]`}>Extérieur</th>
            <th className={`${th} w-[12%] pr-4`}>Statut</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => {
            const isBye = match.isBye && !forceNotBye;
            // Un exempt est un vrai appariement contre X (voir
            // BYE_HOME_SCORE dans classic.ts) : "X" plutôt qu'un tiret pour
            // le côté sans adversaire réel.
            const opponentPlaceholder = isBye ? "X" : "—";
            // Par équipes, homeStarts alterne d'un échiquier à l'autre au
            // sein d'une même confrontation (voir createTeamEncounterMatches)
            // pour équilibrer qui débute la partie ; le joueur qui débute
            // est toujours affiché à gauche, sans toucher homeTeamId/
            // awayTeamId (utilisés pour le classement par équipes).
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
            const leftWins = leftScore != null && rightScore != null && leftScore > rightScore;
            const rightWins = leftScore != null && rightScore != null && rightScore > leftScore;
            return (
              <tr key={match.id} className={matchRow}>
                <td className={`${matchCell} pl-4 truncate`}>{leftName}</td>
                <td className={`${scoreCell} text-center`}>
                  <span className={leftWins ? "text-moss dark:text-moss-light" : ""}>
                    {leftScore ?? "-"}
                  </span>
                  {" - "}
                  <span className={rightWins ? "text-moss dark:text-moss-light" : ""}>
                    {rightScore ?? "-"}
                  </span>
                </td>
                <td className={`${matchCell} truncate`}>{rightName}</td>
                <td className={`${matchCell} pr-4`}>
                  <MatchStatusPill status={match.status} isBye={forceNotBye ? false : match.isBye} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type RoundWithRelations = {
  id: string;
  number: number;
  isFinalPhase: boolean;
  isSwissPhase: boolean;
  knockoutLeg: number | null;
  knockoutStage: number | null;
  matches: RoundMatch[];
};

interface KnockoutConfrontation {
  isBye: boolean;
  homePlayer: RoundMatch["homePlayer"];
  awayPlayer: RoundMatch["awayPlayer"];
  // Score de l'exempt contre X (voir BYE_HOME_SCORE dans classic.ts) —
  // uniquement renseigné quand isBye est vrai.
  byeScore?: { home: number | null; away: number | null };
  legs: (RoundMatch | null)[];
}

// Voir le commentaire équivalent côté admin.
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

// Voir le commentaire équivalent côté admin.
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

// Version en lecture seule de la table de confrontations aller-retour-belle
// (voir l'équivalent interactif côté admin) : une ligne par confrontation,
// une colonne par manche.
function KnockoutConfrontationsTable({
  confrontations,
  legLabels,
}: {
  confrontations: KnockoutConfrontation[];
  legLabels: string[];
}) {
  return (
    <div className={`overflow-hidden overflow-x-auto ${card}`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className={headRow}>
            <th className={`${th} pl-4`}>Domicile</th>
            {legLabels.map((label) => (
              <th key={label} className={`${th} text-center`}>
                {label}
              </th>
            ))}
            <th className={`${th} pr-4`}>Extérieur</th>
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
              <tr key={i} className={matchRow}>
                <td className={`${matchCell} pl-4 truncate`}>{homeName}</td>
                {c.isBye ? (
                  <td colSpan={legLabels.length} className={`${matchCell} text-center`}>
                    {c.byeScore?.home ?? "-"} - {c.byeScore?.away ?? "-"} (exempt)
                  </td>
                ) : (
                  legLabels.map((label, i2) => {
                    const m = c.legs[i2];
                    return (
                      <td key={label} className={`${scoreCell} text-center whitespace-nowrap`}>
                        {m ? `${m.homeScore ?? "-"} - ${m.awayScore ?? "-"}` : "—"}
                      </td>
                    );
                  })
                )}
                <td className={`${matchCell} pr-4 truncate`}>{awayName}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function TournamentRoundsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { slug },
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
            // Trié par id (ordre de création), stable dans le temps — voir
            // le commentaire équivalent côté admin : sans clé de tri, ou en
            // triant par un numéro de table qui repart de 1 à chaque
            // confrontation d'équipes, l'ordre des lignes n'est pas garanti
            // stable après une mise à jour de score.
            orderBy: { id: "asc" },
          },
        },
      },
    },
  });
  if (!tournament || tournament.type !== "CLASSIC") notFound();

  // Regroupe les rondes aller/retour/belle d'un même tour dès qu'au moins 2
  // manches existent (voir buildKnockoutRenderUnits), pour l'affichage
  // compact façon feuille de match ci-dessous.
  const renderUnits = buildKnockoutRenderUnits(tournament.rounds);

  return (
    <div className="mx-auto max-w-4xl w-full px-4 py-10 flex flex-col gap-6">
      <div>
        <Link
          href={`/tournois/${tournament.slug}`}
          className="text-sm text-black/60 dark:text-white/60 hover:underline"
        >
          ← Retour au tournoi
        </Link>
        <p className="text-sm text-black/50 dark:text-white/50 mt-1">
          Scrabble classique · {tournamentStatusLabel[tournament.status]}
        </p>
        <h1 className="font-heading text-3xl font-semibold">
          Rondes &amp; résultats — {tournament.name}
        </h1>
      </div>

      <div className="flex flex-col gap-6">
        {renderUnits.map((unit) => {
          if (unit.kind === "stage") {
            const leg1 = unit.legRounds.find((r) => r.knockoutLeg === 1)!;
            const { confrontations, legLabels } = buildKnockoutConfrontations(unit.legRounds);
            const thirdPlaceMatches = unit.legRounds.flatMap((r) =>
              r.matches.filter((m) => m.isThirdPlace)
            );
            return (
              <div key={unit.knockoutStage} id={`ronde-${leg1.number}`} className="flex flex-col gap-4 scroll-mt-20">
                <div className="flex flex-col gap-1.5">
                  <h3 className={roundHeading}>
                    <a href={`#ronde-${leg1.number}`} className="hover:underline">
                      {getKnockoutStageLabel(
                        countKnockoutEntrants(leg1.matches.filter((m) => !m.isThirdPlace))
                      )}
                    </a>
                  </h3>
                  <KnockoutConfrontationsTable confrontations={confrontations} legLabels={legLabels} />
                </div>
                {thirdPlaceMatches.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-sm font-semibold text-navy dark:text-navy-light">
                      Match pour la 3ᵉ place
                    </h3>
                    <MatchTable matches={thirdPlaceMatches} />
                  </div>
                )}
              </div>
            );
          }

          const round = unit.round;
          const roundHasPoolMatches = round.matches.some((m) => m.pool);

          if (
            !tournament.isTeamEvent &&
            (tournament.format === "GROUPS" || tournament.format === "COMBINED") &&
            roundHasPoolMatches
          ) {
            const byPool = new Map<
              string,
              { poolName: string; matches: typeof round.matches }
            >();
            for (const match of round.matches) {
              if (!match.pool) continue;
              if (!byPool.has(match.pool.id)) {
                byPool.set(match.pool.id, { poolName: match.pool.name, matches: [] });
              }
              byPool.get(match.pool.id)!.matches.push(match);
            }

            return (
              <div key={round.id} id={`ronde-${round.number}`} className="flex flex-col gap-4 scroll-mt-20">
                <h3 className={roundHeading}>
                  <a href={`#ronde-${round.number}`} className="hover:underline">
                    Ronde {round.number}
                  </a>
                </h3>
                {[...byPool.values()].map(({ poolName, matches }) => (
                  <div key={poolName} className="flex flex-col gap-1.5">
                    <PoolBadge name={poolName} />
                    <MatchTable matches={matches} />
                  </div>
                ))}
              </div>
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
              <div key={round.id} id={`ronde-${round.number}`} className="flex flex-col gap-4 scroll-mt-20">
                <div className="flex flex-col gap-1.5">
                  <h3 className={roundHeading}>
                    <a href={`#ronde-${round.number}`} className="hover:underline">
                      {isKnockoutRound
                        ? getKnockoutStageLabel(countKnockoutEntrants(mainMatches))
                        : `Ronde ${round.number}`}
                    </a>
                  </h3>
                  <MatchTable matches={mainMatches} />
                </div>
                {thirdPlaceMatches.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-sm font-semibold text-navy dark:text-navy-light">
                      Match pour la 3ᵉ place
                    </h3>
                    <MatchTable matches={thirdPlaceMatches} />
                  </div>
                )}
              </div>
            );
          }

          if (
            (tournament.format === "GROUPS" || tournament.format === "COMBINED") &&
            roundHasPoolMatches
          ) {
            // Tournoi par équipes en poules : regroupe d'abord par
            // poule, puis par confrontation d'équipes.
            const byPool = new Map<
              string,
              {
                poolName: string;
                encounters: Map<string, { homeTeamName: string; awayTeamName: string; matches: typeof round.matches }>;
                byes: { name: string; homeScore: number | null; awayScore: number | null }[];
              }
            >();

            for (const match of round.matches) {
              if (!match.pool) continue;
              if (!byPool.has(match.pool.id)) {
                byPool.set(match.pool.id, {
                  poolName: match.pool.name,
                  encounters: new Map(),
                  byes: [],
                });
              }
              const entry = byPool.get(match.pool.id)!;
              if (match.isBye) {
                if (match.homeTeam) {
                  entry.byes.push({
                    name: match.homeTeam.name,
                    homeScore: match.homeScore,
                    awayScore: match.awayScore,
                  });
                }
                continue;
              }
              if (!match.homeTeam || !match.awayTeam) continue;
              const key = `${match.homeTeam.id}:${match.awayTeam.id}`;
              if (!entry.encounters.has(key)) {
                entry.encounters.set(key, {
                  homeTeamName: match.homeTeam.name,
                  awayTeamName: match.awayTeam.name,
                  matches: [],
                });
              }
              entry.encounters.get(key)!.matches.push(match);
            }

            return (
              <div key={round.id} id={`ronde-${round.number}`} className="flex flex-col gap-5 scroll-mt-20">
                <h3 className={roundHeading}>
                  <a href={`#ronde-${round.number}`} className="hover:underline">
                    Ronde {round.number}
                  </a>
                </h3>
                {[...byPool.values()].map(({ poolName, encounters, byes }) => (
                  <div key={poolName} className="flex flex-col gap-3">
                    <PoolBadge name={poolName} />
                    {[...encounters.values()].map(({ homeTeamName, awayTeamName, matches }) => (
                      <div key={`${homeTeamName}:${awayTeamName}`} className="pl-4 flex flex-col gap-1.5">
                        <p className="text-sm font-semibold text-black/80 dark:text-white/80 flex flex-wrap items-center gap-2">
                          <span>
                            {homeTeamName}{" "}
                            <span className="text-gold dark:text-gold-light font-normal">vs</span> {awayTeamName}
                          </span>
                          <EncounterWinnerLabel
                            matches={matches}
                            homeTeamName={homeTeamName}
                            awayTeamName={awayTeamName}
                          />
                        </p>
                        <MatchTable matches={matches} forceNotBye />
                      </div>
                    ))}
                    {byes.map(({ name, homeScore, awayScore }) => (
                      <p key={name} className="text-sm text-black/50 dark:text-white/50 pl-4">
                        {name} vs X : {homeScore ?? "-"} - {awayScore ?? "-"} (exempt)
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            );
          }

          // Tournoi par équipes : regroupe les échiquiers par confrontation.
          // Le match pour la 3e place (le cas échéant) est exclu de ce
          // regroupement principal pour ne pas fausser le décompte des
          // entrants (et donc l'étiquette du tour) et s'affiche à part.
          const encounters = new Map<
            string,
            { homeTeamName: string; awayTeamName: string; matches: typeof round.matches }
          >();
          const byes: { name: string; homeScore: number | null; awayScore: number | null }[] = [];
          let thirdPlaceEncounter: { homeTeamName: string; awayTeamName: string; matches: typeof round.matches } | null =
            null;

          for (const match of round.matches) {
            if (match.isBye) {
              if (match.homeTeam) {
                byes.push({ name: match.homeTeam.name, homeScore: match.homeScore, awayScore: match.awayScore });
              }
              continue;
            }
            if (!match.homeTeam || !match.awayTeam) continue;
            if (match.isThirdPlace) {
              if (!thirdPlaceEncounter) {
                thirdPlaceEncounter = {
                  homeTeamName: match.homeTeam.name,
                  awayTeamName: match.awayTeam.name,
                  matches: [],
                };
              }
              thirdPlaceEncounter.matches.push(match);
              continue;
            }
            const key = `${match.homeTeam.id}:${match.awayTeam.id}`;
            if (!encounters.has(key)) {
              encounters.set(key, {
                homeTeamName: match.homeTeam.name,
                awayTeamName: match.awayTeam.name,
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
            <div key={round.id} id={`ronde-${round.number}`} className="flex flex-col gap-4 scroll-mt-20">
              <h3 className={roundHeading}>
                <a href={`#ronde-${round.number}`} className="hover:underline">
                  {isKnockoutRound
                    ? getKnockoutStageLabel(
                        countKnockoutEntrants([...encounters.values()].flatMap((e) => e.matches))
                      )
                    : `Ronde ${round.number}`}
                </a>
              </h3>
              {[...encounters.values()].map(({ homeTeamName, awayTeamName, matches }) => (
                <div key={`${homeTeamName}:${awayTeamName}`} className="flex flex-col gap-1.5">
                  <p className="text-sm font-semibold text-black/80 dark:text-white/80 flex flex-wrap items-center gap-2">
                    <span>
                      {homeTeamName} <span className="text-gold dark:text-gold-light font-normal">vs</span> {awayTeamName}
                    </span>
                    <EncounterWinnerLabel
                      matches={matches}
                      homeTeamName={homeTeamName}
                      awayTeamName={awayTeamName}
                    />
                  </p>
                  <MatchTable matches={matches} forceNotBye />
                </div>
              ))}
              {byes.map(({ name, homeScore, awayScore }) => (
                <p key={name} className="text-sm text-black/50 dark:text-white/50">
                  {name} vs X : {homeScore ?? "-"} - {awayScore ?? "-"} (exempt)
                </p>
              ))}
              {thirdPlaceEncounter && (
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-sm font-semibold text-navy dark:text-navy-light flex flex-wrap items-center gap-2">
                    <span>
                      Match pour la 3ᵉ place — {thirdPlaceEncounter.homeTeamName}{" "}
                      <span className="text-gold dark:text-gold-light font-normal">vs</span>{" "}
                      {thirdPlaceEncounter.awayTeamName}
                    </span>
                    <EncounterWinnerLabel
                      matches={thirdPlaceEncounter.matches}
                      homeTeamName={thirdPlaceEncounter.homeTeamName}
                      awayTeamName={thirdPlaceEncounter.awayTeamName}
                    />
                  </h3>
                  <MatchTable matches={thirdPlaceEncounter.matches} forceNotBye />
                </div>
              )}
            </div>
          );
        })}
        {tournament.rounds.length === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            Les rondes n&apos;ont pas encore été publiées.
          </p>
        )}
      </div>
    </div>
  );
}
