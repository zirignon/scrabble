import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { tournamentStatusLabel } from "@/lib/labels";
import { headRow, th, matchRow, matchCell, scoreCell, MatchStatusPill, PoolBadge } from "@/components/public/StatusPill";
import { countKnockoutEntrants, getKnockoutStageLabel } from "@/lib/classic/knockout";

type RoundMatch = Prisma.MatchGetPayload<{
  include: { homePlayer: true; awayPlayer: true; homeTeam: true; awayTeam: true; pool: true };
}>;

const roundHeading = "font-heading text-lg font-semibold text-navy dark:text-navy-light";

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
    <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
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
            // Par équipes, homeStarts alterne d'un échiquier à l'autre au
            // sein d'une même confrontation (voir createTeamEncounterMatches)
            // pour équilibrer qui débute la partie ; le joueur qui débute
            // est toujours affiché à gauche, sans toucher homeTeamId/
            // awayTeamId (utilisés pour le classement par équipes).
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
            const leftWins =
              !isBye && leftScore != null && rightScore != null && leftScore > rightScore;
            const rightWins =
              !isBye && leftScore != null && rightScore != null && rightScore > leftScore;
            return (
              <tr key={match.id} className={matchRow}>
                <td className={`${matchCell} pl-4 truncate`}>{leftName}</td>
                <td className={`${scoreCell} text-center`}>
                  {isBye ? (
                    "—"
                  ) : (
                    <>
                      <span className={leftWins ? "text-moss dark:text-moss-light" : ""}>
                        {leftScore ?? "-"}
                      </span>
                      {" - "}
                      <span className={rightWins ? "text-moss dark:text-moss-light" : ""}>
                        {rightScore ?? "-"}
                      </span>
                    </>
                  )}
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
        {tournament.rounds.map((round) => {
          const roundHasPoolMatches = round.matches.some((m) => m.pool);

          if (!tournament.isTeamEvent && tournament.format === "GROUPS" && roundHasPoolMatches) {
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
              <div key={round.id} className="flex flex-col gap-4">
                <h3 className={roundHeading}>Ronde {round.number}</h3>
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
              round.isFinalPhase;
            const mainMatches = round.matches.filter((m) => !m.isThirdPlace);
            const thirdPlaceMatches = round.matches.filter((m) => m.isThirdPlace);
            return (
              <div key={round.id} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <h3 className={roundHeading}>
                    {isKnockoutRound
                      ? getKnockoutStageLabel(countKnockoutEntrants(mainMatches))
                      : `Ronde ${round.number}`}
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

          if (tournament.format === "GROUPS" && roundHasPoolMatches) {
            // Tournoi par équipes en poules : regroupe d'abord par
            // poule, puis par confrontation d'équipes.
            const byPool = new Map<
              string,
              {
                poolName: string;
                encounters: Map<string, { homeTeamName: string; awayTeamName: string; matches: typeof round.matches }>;
                byeTeamNames: string[];
              }
            >();

            for (const match of round.matches) {
              if (!match.pool) continue;
              if (!byPool.has(match.pool.id)) {
                byPool.set(match.pool.id, {
                  poolName: match.pool.name,
                  encounters: new Map(),
                  byeTeamNames: [],
                });
              }
              const entry = byPool.get(match.pool.id)!;
              if (match.isBye) {
                if (match.homeTeam) entry.byeTeamNames.push(match.homeTeam.name);
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
              <div key={round.id} className="flex flex-col gap-5">
                <h3 className={roundHeading}>Ronde {round.number}</h3>
                {[...byPool.values()].map(({ poolName, encounters, byeTeamNames }) => (
                  <div key={poolName} className="flex flex-col gap-3">
                    <PoolBadge name={poolName} />
                    {[...encounters.values()].map(({ homeTeamName, awayTeamName, matches }) => (
                      <div key={`${homeTeamName}:${awayTeamName}`} className="pl-4 flex flex-col gap-1.5">
                        <p className="text-sm font-semibold text-black/80 dark:text-white/80">
                          {homeTeamName}{" "}
                          <span className="text-gold dark:text-gold-light font-normal">vs</span> {awayTeamName}
                        </p>
                        <MatchTable matches={matches} forceNotBye />
                      </div>
                    ))}
                    {byeTeamNames.map((name) => (
                      <p key={name} className="text-sm text-black/50 dark:text-white/50 pl-4">
                        {name} : équipe exempte pour cette ronde.
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
          const byeTeamNames: string[] = [];
          let thirdPlaceEncounter: { homeTeamName: string; awayTeamName: string; matches: typeof round.matches } | null =
            null;

          for (const match of round.matches) {
            if (match.isBye) {
              if (match.homeTeam) byeTeamNames.push(match.homeTeam.name);
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
            tournament.format === "KNOCKOUT" || tournament.format === "GROUPS" || round.isFinalPhase;
          return (
            <div key={round.id} className="flex flex-col gap-4">
              <h3 className={roundHeading}>
                {isKnockoutRound
                  ? getKnockoutStageLabel(
                      countKnockoutEntrants([...encounters.values()].flatMap((e) => e.matches))
                    )
                  : `Ronde ${round.number}`}
              </h3>
              {[...encounters.values()].map(({ homeTeamName, awayTeamName, matches }) => (
                <div key={`${homeTeamName}:${awayTeamName}`} className="flex flex-col gap-1.5">
                  <p className="text-sm font-semibold text-black/80 dark:text-white/80">
                    {homeTeamName} <span className="text-gold dark:text-gold-light font-normal">vs</span> {awayTeamName}
                  </p>
                  <MatchTable matches={matches} forceNotBye />
                </div>
              ))}
              {byeTeamNames.map((name) => (
                <p key={name} className="text-sm text-black/50 dark:text-white/50">
                  {name} : équipe exempte pour cette ronde.
                </p>
              ))}
              {thirdPlaceEncounter && (
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-sm font-semibold text-navy dark:text-navy-light">
                    Match pour la 3ᵉ place — {thirdPlaceEncounter.homeTeamName}{" "}
                    <span className="text-gold dark:text-gold-light font-normal">vs</span>{" "}
                    {thirdPlaceEncounter.awayTeamName}
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
