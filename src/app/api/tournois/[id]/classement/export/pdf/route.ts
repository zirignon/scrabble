import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeClassicStandings,
  computeClassicSwissPhaseStandings,
  type ClassicStandingRow,
} from "@/lib/classic/standings";
import { computeClassicGeneralPoolStandings, computeClassicPoolStandings } from "@/lib/classic/poolStandings";
import { computeDuplicateStandingsWithGames } from "@/lib/duplicate/standings";
import { pdfResponse, renderTablePdf, renderMultiTablePdf, type PdfSection } from "@/lib/pdf";
import { slugify } from "@/lib/slug";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    return new Response("Tournoi introuvable", { status: 404 });
  }

  const subtitle = `${tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"} — ${new Date(tournament.startDate).toLocaleDateString("fr-FR")}`;

  let pdf: Buffer;
  const isPoolFormat = tournament.format === "GROUPS" || tournament.format === "COMBINED";
  if (tournament.type === "CLASSIC" && isPoolFormat && !tournament.isTeamEvent) {
    // Poules : chaque poule joue son propre round-robin interne, donc son
    // classement n'a de sens que par poule (contrairement au classement
    // général qui mélangerait des joueurs ne s'étant jamais affrontés) —
    // voir la page classement publique, qui affiche déjà un tableau par
    // poule plutôt qu'un classement général unique dans ce cas.
    const poolColumnWeights = [0.7, 3, 0.7, 0.7, 0.7, 0.7, 0.9, 0.8, 0.9, 0.7, 0.9, 1.3, 0.9];
    const poolRowMapper = (row: ClassicStandingRow, i: number) => [
      i + 1,
      `${row.lastName} ${row.firstName}`,
      row.played,
      row.wins,
      row.draws,
      row.losses,
      row.forfeits,
      row.matchPoints,
      row.diff,
      row.sonnebornBerger,
      row.buchholz,
      row.buchholzMedian,
      row.cumulativeScore,
    ];
    const standingsHeaders = ["Rang", "Joueur", "J", "V", "N", "D", "Abs.", "Pts", "Diff", "SB", "Bchz", "Bchz méd.", "Cumul"];

    // Combiné (poules puis suisse) : voir le commentaire équivalent sur
    // Tournament.allowRematchesFromRound — une fois la 1re ronde suisse
    // générée, les classements par poule n'ont plus lieu d'être affichés à
    // côté du classement combiné, qui les remplace entièrement (titré
    // "Classement après la ronde N", N étant la ronde globale la plus
    // récente, poules incluses).
    const lastRound =
      tournament.format === "COMBINED"
        ? await prisma.round.findFirst({ where: { tournamentId: tournament.id }, orderBy: { number: "desc" } })
        : null;
    const swissPhaseStarted =
      tournament.format === "COMBINED"
        ? (await prisma.round.count({ where: { tournamentId: tournament.id, isSwissPhase: true } })) > 0
        : false;

    let sections: PdfSection[];
    if (tournament.format === "COMBINED" && swissPhaseStarted) {
      const swissPhaseStandings = await computeClassicSwissPhaseStandings(tournament.id);
      sections = [
        {
          heading: `Classement après la ronde ${lastRound?.number}`,
          headers: standingsHeaders,
          rows: swissPhaseStandings.map(poolRowMapper),
          columnWeights: poolColumnWeights,
        },
      ];
    } else {
      const pools = await computeClassicPoolStandings(tournament.id);
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
        const generalStandings = await computeClassicGeneralPoolStandings(tournament.id);
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

    pdf = await renderMultiTablePdf(
      `Classement par poule — ${tournament.name}`,
      subtitle,
      sections,
      { landscape: true }
    );
  } else if (tournament.type === "CLASSIC") {
    const standings = await computeClassicStandings(tournament.id);
    pdf = await renderTablePdf(
      `Classement — ${tournament.name}`,
      subtitle,
      ["Rang", "Joueur", "Âge", "Club", "Fédé", "Classement", "J", "V", "N", "D", "Abs.", "Pts", "Diff", "SB", "Bchz", "Bchz méd.", "Cumul"],
      standings.map((row, i) => [
        i + 1,
        `${row.lastName} ${row.firstName}`,
        row.category ?? "",
        row.clubName ?? "",
        row.federation ?? "",
        row.classification ?? "",
        row.played,
        row.wins,
        row.draws,
        row.losses,
        row.forfeits,
        row.matchPoints,
        row.diff,
        row.sonnebornBerger,
        row.buchholz,
        row.buchholzMedian,
        row.cumulativeScore,
      ]),
      // Idem : "Classement" et "Bchz méd." sont les libellés les plus longs
      // de leur catégorie (texte / chiffré) et repassaient sinon seuls sur
      // deux lignes, alors que toutes les autres colonnes restaient sur une
      // — les poids ci-dessous leur donnent la place nécessaire pour rester
      // sur une seule ligne, comme le reste de l'en-tête.
      [0.7, 2.6, 0.8, 1.4, 0.8, 1.6, 0.7, 0.7, 0.7, 0.7, 0.9, 0.8, 0.9, 0.7, 0.9, 1.3, 0.9],
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

  return pdfResponse(`classement-${slugify(tournament.name)}.pdf`, pdf);
}
