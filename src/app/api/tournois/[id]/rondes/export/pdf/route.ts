import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { pdfResponse, renderMultiTablePdf, type PdfSection } from "@/lib/pdf";
import { slugify } from "@/lib/slug";
import { countKnockoutEntrants, getKnockoutStageLabel } from "@/lib/classic/knockout";

const statusLabel: Record<string, string> = {
  SCHEDULED: "À jouer",
  PLAYED: "Joué",
  FORFEIT_HOME: "Forfait (domicile)",
  FORFEIT_AWAY: "Forfait (extérieur)",
  FORFEIT_BOTH: "Forfait (double)",
  CANCELLED: "Annulé",
};

const headers = ["Ronde", "Table", "Domicile", "Score dom.", "Score ext.", "Extérieur", "Statut"];
const columnWeights = [1.5, 0.6, 1.6, 0.9, 0.9, 1.6, 1.3];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(STAFF_ROLES);
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      rounds: {
        orderBy: { number: "asc" },
        include: {
          matches: {
            include: { homePlayer: true, awayPlayer: true },
            // id (ordre de création) plutôt que table — voir le commentaire
            // équivalent sur les pages rondes : le numéro de table repart de
            // 1 à chaque confrontation d'équipes, donc ce n'est pas une clé
            // de tri stable.
            orderBy: { id: "asc" },
          },
        },
      },
    },
  });
  if (!tournament || tournament.type !== "CLASSIC") {
    return new Response("Tournoi introuvable", { status: 404 });
  }
  if (!canManageTournament(session, tournament.organizerId)) {
    return new Response("Non autorisé", { status: 403 });
  }
  const rounds = tournament.rounds;
  type RoundRow = (typeof rounds)[number];
  type MatchRow = RoundRow["matches"][number];

  interface KnockoutConfrontation {
    table: number | null;
    isBye: boolean;
    homePlayer: MatchRow["homePlayer"];
    awayPlayer: MatchRow["awayPlayer"];
    legs: (MatchRow | null)[];
  }

  // Voir le commentaire équivalent sur les pages rondes.
  function buildKnockoutConfrontations(legRounds: RoundRow[]): {
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
    | { kind: "single"; round: RoundRow }
    | { kind: "stage"; knockoutStage: number; legRounds: RoundRow[] };

  // Voir le commentaire équivalent sur les pages rondes.
  function buildKnockoutRenderUnits(allRounds: RoundRow[]): RenderUnit[] {
    const units: RenderUnit[] = [];
    const seenStages = new Set<number>();
    for (const round of allRounds) {
      if (round.knockoutStage !== null) {
        if (seenStages.has(round.knockoutStage)) continue;
        seenStages.add(round.knockoutStage);
        const legRounds = allRounds.filter((r) => r.knockoutStage === round.knockoutStage);
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

  function legCellText(m: MatchRow | null): string {
    if (!m) return "—";
    if (m.status === "SCHEDULED") return "-";
    if (m.status !== "PLAYED") return statusLabel[m.status];
    return `${m.homeScore ?? "-"} - ${m.awayScore ?? "-"}`;
  }

  // Une ligne par confrontation, une colonne par manche — voir le
  // commentaire équivalent sur les pages rondes.
  function buildStageRows(confrontations: KnockoutConfrontation[], legLabels: string[]) {
    return confrontations.map((c) => {
      const homeName = c.homePlayer ? `${c.homePlayer.lastName} ${c.homePlayer.firstName}` : "";
      const awayName = c.awayPlayer ? `${c.awayPlayer.lastName} ${c.awayPlayer.firstName}` : "";
      if (c.isBye) {
        return [c.table ?? "", homeName, `Exempt (${homeName})`, ...legLabels.slice(1).map(() => ""), ""];
      }
      return [c.table ?? "", homeName, ...c.legs.map((leg) => legCellText(leg)), awayName];
    });
  }

  function buildRows(round: (typeof rounds)[number], roundLabel: string) {
    return round.matches.map((match) => {
      // Par équipes, homeStarts alterne d'un échiquier à l'autre pour
      // équilibrer qui débute la partie ; le joueur qui débute est
      // toujours listé en "Domicile" — voir le commentaire équivalent sur
      // les pages rondes.
      const homeName = match.homePlayer ? `${match.homePlayer.lastName} ${match.homePlayer.firstName}` : "";
      const awayName = match.awayPlayer ? `${match.awayPlayer.lastName} ${match.awayPlayer.firstName}` : "";
      const leftName = match.homeStarts ? homeName : awayName;
      const rightName = match.homeStarts ? awayName : homeName;
      const leftScore = match.homeStarts ? match.homeScore : match.awayScore;
      const rightScore = match.homeStarts ? match.awayScore : match.homeScore;
      return [
        match.isThirdPlace ? "Match pour la 3ᵉ place" : roundLabel,
        match.table ?? "",
        match.isBye ? "" : leftName,
        match.isBye ? "" : (leftScore ?? ""),
        match.isBye ? "" : (rightScore ?? ""),
        match.isBye ? "" : rightName,
        match.isBye ? `Exempt (${homeName})` : statusLabel[match.status],
      ];
    });
  }

  // Une ronde à élimination directe (tableau après poules, phase finale de
  // round-robin/suisse, ou format élimination directe pur) affiche son nom
  // de tour (Demi-finales, Finale...) plutôt que son simple numéro — voir
  // le commentaire équivalent sur les pages rondes/écran public. Les rondes
  // de phase principale, celles de la phase suisse d'un tournoi Combiné
  // (voir isSwissPhase) et celles de phase finale sont regroupées dans des
  // tableaux distincts (au lieu d'un seul tableau continu), pour que la
  // transition entre phases soit visuellement nette. Un tour joué en 2
  // manches + belle (voir Tournament.knockoutTwoLegs) devient sa propre
  // section à colonnes dynamiques (une par manche) plutôt que de rejoindre
  // le tableau "Phase finale" à colonnes fixes.
  // Les rondes de phase finale sont collectées dans l'ordre de rencontre
  // (numéro de ronde croissant) en "chunks" — soit des lignes de rondes
  // classiques à fusionner dans un même tableau "Phase finale", soit les
  // sections dédiées d'un tour en 2 manches + belle — plutôt que dans un
  // seul tableau fusionné, pour que l'ordre d'impression (Demi-finales
  // avant Finale, etc.) reste correct même quand certains tours utilisent
  // le format 2 manches + belle et d'autres non (ex. la Finale tant que sa
  // manche retour n'a pas encore été générée).
  type FinalPhaseChunk = { kind: "single"; rows: unknown[][] } | { kind: "stage"; sections: PdfSection[] };
  const mainRows: unknown[][] = [];
  const swissPhaseRows: unknown[][] = [];
  const finalPhaseChunks: FinalPhaseChunk[] = [];
  let pendingFinalRows: unknown[][] = [];
  for (const unit of buildKnockoutRenderUnits(rounds)) {
    if (unit.kind === "stage") {
      if (pendingFinalRows.length > 0) {
        finalPhaseChunks.push({ kind: "single", rows: pendingFinalRows });
        pendingFinalRows = [];
      }
      const leg1 = unit.legRounds.find((r) => r.knockoutLeg === 1)!;
      const { confrontations, legLabels } = buildKnockoutConfrontations(unit.legRounds);
      const thirdPlaceMatches = unit.legRounds.flatMap((r) => r.matches.filter((m) => m.isThirdPlace));
      const stageSections: PdfSection[] = [
        {
          heading: getKnockoutStageLabel(
            countKnockoutEntrants(leg1.matches.filter((m) => !m.isThirdPlace))
          ),
          headers: ["Table", "Domicile", ...legLabels, "Extérieur"],
          rows: buildStageRows(confrontations, legLabels),
          columnWeights: [0.6, 1.6, ...legLabels.map(() => 1.1), 1.6],
        },
      ];
      if (thirdPlaceMatches.length > 0) {
        stageSections.push({
          heading: "Match pour la 3ᵉ place",
          headers: ["Table", "Domicile", "Score dom.", "Score ext.", "Extérieur", "Statut"],
          rows: buildRows({ ...leg1, matches: thirdPlaceMatches }, "").map(
            ([, table, home, homeScore, awayScore, away, status]) => [table, home, homeScore, awayScore, away, status]
          ),
          columnWeights: [0.6, 1.6, 0.9, 0.9, 1.6, 1.3],
        });
      }
      finalPhaseChunks.push({ kind: "stage", sections: stageSections });
      continue;
    }

    const round = unit.round;
    if (round.isSwissPhase) {
      swissPhaseRows.push(...buildRows(round, `Ronde ${round.number}`));
      continue;
    }
    const grouped = round.matches.some((m) => m.poolId);
    const isKnockoutRound =
      tournament.format === "KNOCKOUT" ||
      (tournament.format === "GROUPS" && !grouped) ||
      round.isFinalPhase;
    const mainMatches = round.matches.filter((m) => !m.isThirdPlace);
    const roundLabel = isKnockoutRound
      ? getKnockoutStageLabel(countKnockoutEntrants(mainMatches))
      : `Ronde ${round.number}`;
    if (isKnockoutRound) {
      pendingFinalRows.push(...buildRows(round, roundLabel));
    } else {
      mainRows.push(...buildRows(round, roundLabel));
    }
  }
  if (pendingFinalRows.length > 0) {
    finalPhaseChunks.push({ kind: "single", rows: pendingFinalRows });
  }

  const sections: PdfSection[] = [];
  // Le titre de chaque section n'est utile que s'il y a bien plusieurs
  // phases distinctes à distinguer ; sinon (tournoi entièrement en
  // round-robin/suisse, ou entièrement en élimination directe), un seul
  // tableau sans sous-titre suffit, comme avant. Dès qu'un tour en 2
  // manches + belle existe, les intitulés sont toujours affichés (sans quoi
  // un tableau "Phase finale" voisin resterait sans titre à côté de
  // "Demi-finales"/"Finale").
  const hasStage = finalPhaseChunks.some((c) => c.kind === "stage");
  const phaseCount = [mainRows.length > 0, swissPhaseRows.length > 0, finalPhaseChunks.length > 0].filter(
    Boolean
  ).length;
  const showHeadings = phaseCount > 1 || hasStage;
  if (mainRows.length > 0) {
    sections.push({
      heading: showHeadings
        ? tournament.format === "GROUPS" || tournament.format === "COMBINED"
          ? "Phase de poules"
          : "Phase principale"
        : undefined,
      headers,
      rows: mainRows,
      columnWeights,
    });
  }
  if (swissPhaseRows.length > 0) {
    sections.push({
      heading: showHeadings ? "Phase suisse" : undefined,
      headers,
      rows: swissPhaseRows,
      columnWeights,
    });
  }
  for (const chunk of finalPhaseChunks) {
    if (chunk.kind === "stage") {
      sections.push(...chunk.sections);
    } else {
      sections.push({
        heading: showHeadings ? "Phase finale" : undefined,
        headers,
        rows: chunk.rows,
        columnWeights,
      });
    }
  }

  const subtitle = `${tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"} — ${new Date(tournament.startDate).toLocaleDateString("fr-FR")}`;

  const pdf = await renderMultiTablePdf(`Rondes — ${tournament.name}`, subtitle, sections, {
    landscape: true,
  });

  return pdfResponse(`rondes-${slugify(tournament.name)}.pdf`, pdf);
}
