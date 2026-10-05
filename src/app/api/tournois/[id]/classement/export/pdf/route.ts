import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeClassicStandings,
  computeClassicSwissPhaseStandings,
  type ClassicStandingRow,
} from "@/lib/classic/standings";
import { computeClassicGeneralPoolStandings, computeClassicPoolStandings } from "@/lib/classic/poolStandings";
import { computeClassicEloReport } from "@/lib/classic/elo";
import { getCurrentKnockoutStageLabel, getLatestRoundNumber } from "@/lib/classic/knockout";
import { computeDuplicateStandingsWithGames } from "@/lib/duplicate/standings";
import { pdfResponse, renderTablePdf, renderMultiTablePdf, type PdfSection } from "@/lib/pdf";
import { slugify } from "@/lib/slug";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    return new Response("Tournoi introuvable", { status: 404 });
  }

  // Instantané "classement après la ronde N" (voir la page rondes) : reconstitue
  // le classement tel qu'il était à cet instant, même si des rondes plus
  // récentes ont depuis été jouées — un ?ronde= invalide ou absent revient au
  // classement actuel (comportement existant).
  const rondeParam = request.nextUrl.searchParams.get("ronde");
  const uptoRoundNumber =
    rondeParam && /^\d+$/.test(rondeParam) ? Number(rondeParam) : undefined;

  const subtitle = `${tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"} — ${new Date(tournament.startDate).toLocaleDateString("fr-FR")}${
    uptoRoundNumber !== undefined ? ` — Instantané après la ronde ${uptoRoundNumber}` : ""
  }`;

  // Cotes Elo fusionnées dans le tableau de classement (voir le commentaire
  // équivalent sur la page classement publique) : seulement pour l'export
  // "live" du classement actuel, jamais pour un instantané historique
  // (?ronde=) — la cote finale n'a pas de sens à un instant passé du
  // tournoi.
  const eloReport =
    uptoRoundNumber === undefined &&
    tournament.type === "CLASSIC" &&
    !tournament.isTeamEvent &&
    (tournament.status === "COMPLETED" || tournament.status === "ARCHIVED")
      ? await computeClassicEloReport(tournament.id)
      : [];
  const eloByPlayer = new Map(eloReport.map((r) => [r.playerId, r]));
  const eloHeaders = ["Cote initiale", "K", "Évolution", "Nouvelle cote"];
  const eloColumnWeights = [1, 0.5, 1, 1.2];
  function eloCells(playerId: string): (string | number)[] {
    const elo = eloByPlayer.get(playerId);
    if (!elo) return ["—", "—", "—", "—"];
    return [
      elo.eloAtStart,
      elo.coeffAtStart,
      elo.evolution > 0 ? `+${elo.evolution}` : elo.evolution,
      elo.newElo,
    ];
  }

  let pdf: Buffer;
  const isPoolFormat = tournament.format === "GROUPS" || tournament.format === "COMBINED";
  if (tournament.type === "CLASSIC" && isPoolFormat) {
    // Poules : chaque poule joue son propre round-robin interne, donc son
    // classement n'a de sens que par poule (contrairement au classement
    // général qui mélangerait des joueurs ne s'étant jamais affrontés) —
    // voir la page classement publique, qui affiche déjà un tableau par
    // poule plutôt qu'un classement général unique dans ce cas. Même en
    // tournoi par équipes, cet export reste le classement INDIVIDUEL
    // (performance par joueur) — l'export équipes dédié vit dans
    // classement/equipes/export/pdf/route.ts.
    const poolColumnWeights = [0.7, 3, 0.7, 0.7, 0.7, 0.7, 0.8, 0.9, 0.7, 0.9, 1.3, 0.9];
    const poolRowMapper = (row: ClassicStandingRow, i: number) => [
      i + 1,
      `${row.lastName} ${row.firstName}`,
      row.played,
      row.wins,
      row.draws,
      row.losses,
      row.matchPoints,
      row.diff,
      row.sonnebornBerger,
      row.buchholz,
      row.buchholzMedian,
      row.cumulativeScore,
    ];
    const standingsHeaders = ["Rang", "Joueur", "J", "V", "N", "D", "Pts", "Diff", "SB", "Bchz", "Bchz méd.", "Cumul"];

    // Combiné (poules puis suisse) : voir le commentaire équivalent sur
    // Tournament.allowRematchesFromRound — une fois la 1re ronde suisse
    // générée, les classements par poule n'ont plus lieu d'être affichés à
    // côté du classement combiné, qui les remplace entièrement (titré
    // "Classement après la ronde N", N étant la ronde globale la plus
    // récente, poules incluses).
    const lastRound =
      tournament.format === "COMBINED"
        ? { number: await getLatestRoundNumber(tournament.id, uptoRoundNumber) }
        : null;
    // À un instant donné (uptoRoundNumber), la phase suisse n'est "démarrée"
    // que si une ronde suisse existe déjà à ce numéro ou avant — distinct de
    // l'état actuel du tournoi, qui peut avoir avancé depuis.
    const swissPhaseStarted =
      tournament.format === "COMBINED"
        ? (await prisma.round.count({
            where: {
              tournamentId: tournament.id,
              isSwissPhase: true,
              ...(uptoRoundNumber !== undefined ? { number: { lte: uptoRoundNumber } } : {}),
            },
          })) > 0
        : false;

    // GROUPS : une fois la phase finale à élimination directe lancée (voir
    // generateFinalPhaseFromPoolsActionImpl), les classements par poule
    // n'ont plus lieu d'être non plus — remplacés par le classement général
    // qui a servi à qualifier les entrants, sous le titre du tour en cours
    // (Quart de finale, Finale...), comme sur la page classement publique.
    // COMBINED : même règle une fois la phase finale optionnelle lancée
    // après la phase suisse (Tournament.finalPhaseEnabled) — ses rondes
    // continuent la numérotation globale, donc sans ce titre le PDF
    // afficherait à tort "Classement après la ronde N" avec N comptant les
    // rondes à élimination directe, comme si elles faisaient partie de la
    // phase suisse.
    const groupsKnockoutStageLabel =
      tournament.format === "GROUPS" || tournament.format === "COMBINED"
        ? await getCurrentKnockoutStageLabel(tournament.id, tournament.format, uptoRoundNumber)
        : null;

    let sections: PdfSection[];
    if (tournament.format === "COMBINED" && swissPhaseStarted) {
      const swissPhaseStandings = await computeClassicSwissPhaseStandings(tournament.id, uptoRoundNumber);
      sections = [
        {
          heading:
            eloReport.length > 0
              ? "CLASSEMENT FINAL"
              : (groupsKnockoutStageLabel ??
                (lastRound?.number != null ? `Classement après la ronde ${lastRound.number}` : "Classement")),
          headers: eloReport.length > 0 ? [...standingsHeaders, ...eloHeaders] : standingsHeaders,
          rows: swissPhaseStandings.map((r, i) =>
            eloReport.length > 0 ? [...poolRowMapper(r, i), ...eloCells(r.playerId)] : poolRowMapper(r, i)
          ),
          columnWeights: eloReport.length > 0 ? [...poolColumnWeights, ...eloColumnWeights] : poolColumnWeights,
        },
      ];
    } else if (tournament.format === "GROUPS" && groupsKnockoutStageLabel !== null) {
      const generalStandings = await computeClassicGeneralPoolStandings(tournament.id, uptoRoundNumber);
      sections = [
        {
          heading: eloReport.length > 0 ? "CLASSEMENT FINAL" : groupsKnockoutStageLabel,
          headers: eloReport.length > 0 ? [...standingsHeaders, ...eloHeaders] : standingsHeaders,
          rows: generalStandings.map((r, i) =>
            eloReport.length > 0 ? [...poolRowMapper(r, i), ...eloCells(r.playerId)] : poolRowMapper(r, i)
          ),
          columnWeights: eloReport.length > 0 ? [...poolColumnWeights, ...eloColumnWeights] : poolColumnWeights,
        },
      ];
    } else {
      const pools = await computeClassicPoolStandings(tournament.id, uptoRoundNumber);
      sections = pools.map((pool) => ({
        heading: `Poule ${pool.poolName}`,
        headers: standingsHeaders,
        rows: pool.standings.map(poolRowMapper),
        // Poids proportionnels aux libellés réels des colonnes plutôt qu'un
        // poids uniforme : "Bchz méd." (le plus long des libellés chiffrés)
        // repassait sinon sur deux lignes, contrairement aux autres colonnes
        // chiffrées restées sur une seule — incohérence visuelle entre
        // colonnes que ce réglage corrige.
        columnWeights: poolColumnWeights,
      }));
      // Après la phase de poules, un classement général (fusion de toutes
      // les poules) s'ajoute à la suite — c'est ce même classement qui
      // amorce la phase suisse (voir generateSwissPhaseRoundActionImpl).
      if (tournament.format === "COMBINED") {
        const generalStandings = await computeClassicGeneralPoolStandings(tournament.id, uptoRoundNumber);
        if (generalStandings.length > 0) {
          sections.push({
            heading: "Classement général",
            headers: standingsHeaders,
            rows: generalStandings.map(poolRowMapper),
            columnWeights: poolColumnWeights,
          });
        }
      }
    }

    // "Classement par poule" n'a plus de sens comme titre de page une fois
    // qu'il ne reste plus qu'un seul tableau agrégé (classement suisse figé
    // d'un COMBINED, ou classement général d'un GROUPS après la phase
    // finale) : son propre intitulé ("CLASSEMENT FINAL", nom du tour en
    // cours...) suffit déjà, affiché juste en-dessous — le double titre
    // induisait en erreur sur un classement qui n'est plus organisé par
    // poule à ce stade.
    const isSinglePoolFinalSection =
      (tournament.format === "COMBINED" && swissPhaseStarted) ||
      (tournament.format === "GROUPS" && groupsKnockoutStageLabel !== null);
    // En tournoi par équipes, ce document reste le classement INDIVIDUEL
    // (performance par joueur) — précisé dans le titre pour ne pas le
    // confondre avec l'export équipes, un fichier PDF distinct.
    const individualSuffix = tournament.isTeamEvent ? " (individuel)" : "";
    pdf = await renderMultiTablePdf(
      isSinglePoolFinalSection
        ? `${tournament.name}${individualSuffix}`
        : `Classement par poule${individualSuffix} — ${tournament.name}`,
      subtitle,
      sections,
      { landscape: true }
    );
  } else if (tournament.type === "CLASSIC") {
    const standings = await computeClassicStandings(tournament.id, uptoRoundNumber);
    // Voir le commentaire équivalent sur la page classement publique : une
    // fois entré dans un tableau à élimination directe, le titre reprend le
    // nom du tour en cours (Quart de finale, Demi-finale, Finale, ...) ;
    // sinon il reprend le numéro de la ronde globale la plus récente.
    const [knockoutStageLabel, latestRoundNumber] = await Promise.all([
      getCurrentKnockoutStageLabel(tournament.id, tournament.format, uptoRoundNumber),
      getLatestRoundNumber(tournament.id, uptoRoundNumber),
    ]);
    const classementTitle =
      eloReport.length > 0
        ? "CLASSEMENT FINAL"
        : (knockoutStageLabel ??
          (latestRoundNumber !== null ? `Classement après la ronde ${latestRoundNumber}` : "Classement"));
    pdf = await renderTablePdf(
      `${classementTitle} — ${tournament.name}`,
      subtitle,
      [
        "Rang", "Joueur", "Série", "Club", "Fédé", "Catégorie", "J", "V", "N", "D", "Pts", "Diff", "SB", "Bchz", "Bchz méd.", "Cumul",
        ...(eloReport.length > 0 ? eloHeaders : []),
      ],
      standings.map((row, i) => [
        i + 1,
        `${row.lastName} ${row.firstName}`,
        row.classification ?? "",
        row.clubName ?? "",
        row.federation ?? "",
        row.category ?? "",
        row.played,
        row.wins,
        row.draws,
        row.losses,
        row.matchPoints,
        row.diff,
        row.sonnebornBerger,
        row.buchholz,
        row.buchholzMedian,
        row.cumulativeScore,
        ...(eloReport.length > 0 ? eloCells(row.playerId) : []),
      ]),
      // Idem : "Catégorie" et "Bchz méd." sont les libellés les plus longs
      // de leur catégorie (texte / chiffré) et repassaient sinon seuls sur
      // deux lignes, alors que toutes les autres colonnes restaient sur une
      // — les poids ci-dessous leur donnent la place nécessaire pour rester
      // sur une seule ligne, comme le reste de l'en-tête.
      [
        0.9, 2.6, 0.8, 1.4, 0.8, 1.6, 0.7, 0.7, 0.7, 0.7, 0.8, 0.9, 0.7, 0.9, 1.3, 0.9,
        ...(eloReport.length > 0 ? eloColumnWeights : []),
      ],
      { landscape: true }
    );
  } else {
    const { rows: standings, games, topCumul } = await computeDuplicateStandingsWithGames(tournament.id);
    pdf = await renderTablePdf(
      `Classement — ${tournament.name}`,
      subtitle,
      [
        "Rang",
        "Licence",
        "Nom",
        "Prénoms",
        "Cat.",
        "Série",
        "Club",
        "Nat",
        "Cumul",
        "Négatif",
        "%",
        ...games.map((g) => `P${g.gameNumber}`),
      ],
      standings.map((row, i) => {
        const negatif = topCumul != null ? row.net - topCumul : "—";
        const pourcentage = topCumul != null && topCumul > 0 ? `${((row.net / topCumul) * 100).toFixed(2)} %` : "—";
        return [
          i + 1,
          row.licenseNumber ?? "—",
          row.lastName,
          row.firstName,
          row.classification ?? "—",
          row.category ?? "—",
          row.clubName ?? "—",
          row.nationality ?? "—",
          row.net,
          negatif,
          pourcentage,
          ...games.map((g) => row.perGame[g.gameNumber] ?? "—"),
        ];
      }),
      [1, 1.2, 1.4, 1.4, 0.8, 0.8, 1.2, 0.8, 1, 1, 1, ...games.map(() => 0.9)],
      { landscape: true }
    );
  }

  const filenameSuffix = uptoRoundNumber !== undefined ? `-ronde-${uptoRoundNumber}` : "";
  return pdfResponse(`classement${filenameSuffix}-${slugify(tournament.name)}.pdf`, pdf);
}
