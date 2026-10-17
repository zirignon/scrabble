"use client";

import type { KeyboardEvent } from "react";
import {
  checkPlayerWordAction,
  saveTurnScoresAction,
  toggleSoloConfirmationAction,
} from "@/lib/actions/duplicate";
import { formatReference, SOLO_BONUS_POINTS } from "@/lib/duplicate/board";
import { PlayerWordChecker } from "@/components/admin/PlayerWordChecker";
import type { DuplicateMove, DuplicateResult, Player, ReferenceMove } from "@prisma/client";

// Étiquette + info d'affichage pour un coup : la marque de pénalité (indique
// si l'avertissement est encore gratuit ou s'il coûte 5 points comme la
// pénalité) et la bonification solo (règlement FISF §3.5), pour calculer le
// net à afficher sur ce coup précis (le stockage de DuplicateMove.points
// reste le score brut du mot ; les ajustements ne sont réellement appliqués
// qu'au total de la partie). Une pénalité ne peut jamais rendre le net
// négatif (§5.6) — déjà empêché à la saisie, mais on s'en protège ici aussi.
// Un solo détecté ne rapporte ses points qu'une fois validé par l'arbitre
// (DuplicateMove.soloConfirmed) — voir toggleSoloConfirmationAction.
function moveDisplayInfo(
  pm: { points: number; penaltyType: string | null; soloConfirmed?: boolean } | undefined,
  costsFive: boolean,
  isSolo: boolean,
  soloEligible: boolean
) {
  const penaltyType = pm?.penaltyType ?? null;
  const badgeLabel =
    penaltyType === "AVERTISSEMENT" ? "A" : penaltyType === "PENALITE" ? "P" : penaltyType === "ZERO" ? "Z" : null;
  const isFreeAvertissement = penaltyType === "AVERTISSEMENT" && !costsFive;
  const penaltyDeduction =
    penaltyType === "PENALITE" || (penaltyType === "AVERTISSEMENT" && costsFive) ? 5 : 0;
  const soloConfirmed = Boolean(pm?.soloConfirmed);
  const soloBonus = isSolo && soloEligible && soloConfirmed ? SOLO_BONUS_POINTS : 0;
  const net =
    pm && (penaltyDeduction > 0 || soloBonus > 0)
      ? Math.max(0, pm.points - penaltyDeduction) + soloBonus
      : null;
  return { badgeLabel, isFreeAvertissement, isSolo, soloConfirmed, soloBonus, net };
}

// Identifiant DOM du champ "score" d'un joueur à un tour donné, pour la
// navigation au clavier ci-dessous (document.getElementById plutôt qu'un
// état React : simple, et cohérent avec le reste de la feuille de partie,
// qui relie déjà ses champs à leur formulaire via l'attribut form={formId}
// plutôt que par imbrication).
function scoreInputId(turnNumber: number, playerId: string) {
  return `score-${turnNumber}-${playerId}`;
}

function focusScoreInput(turnNumber: number, playerId: string) {
  const target = document.getElementById(scoreInputId(turnNumber, playerId));
  if (target instanceof HTMLInputElement) {
    target.focus();
    target.select();
  }
}

// ← / → fait passer du champ score d'un joueur à celui du joueur suivant
// ou précédent, sur le même tour — l'arbitre peut alors saisir toute une
// ligne de scores au clavier sans revenir à la souris. Remplace la
// navigation normale du curseur à l'intérieur du champ (un score tient sur
// 1 à 3 chiffres, rarement besoin d'y déplacer le curseur), et sélectionne
// le contenu du champ ciblé pour pouvoir le retaper directement.
//
// Entrée donne directement au joueur le top du coup (move.points) — cas
// le plus courant, un joueur qui a trouvé le même mot que le coup de
// référence — sans avoir à retaper le score à la main, puis avance au
// champ du joueur suivant pour enchaîner plusieurs joueurs au top à la
// suite, comme avec ← / →.
function handleScoreKeyDown(
  e: KeyboardEvent<HTMLInputElement>,
  turnNumber: number,
  topPoints: number,
  prevPlayerId: string | undefined,
  nextPlayerId: string | undefined
) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.currentTarget.value = String(topPoints);
    if (nextPlayerId) focusScoreInput(turnNumber, nextPlayerId);
    return;
  }
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const neighborPlayerId = e.key === "ArrowLeft" ? prevPlayerId : nextPlayerId;
  if (!neighborPlayerId) return;
  e.preventDefault();
  focusScoreInput(turnNumber, neighborPlayerId);
}

// Feuille de partie (score de chaque joueur à chaque coup). Rendu à part de
// la page serveur (voir ArbitrationGridPanel, qui l'inclut désormais dans
// sa colonne de droite) pour que la grille de référence, à gauche, puisse
// rester épinglée à l'écran (position sticky) tout le long de cette
// feuille, même sur une partie à de nombreux coups — l'épinglage CSS ne
// fonctionne que si la grille et le contenu à faire défiler partagent un
// même conteneur, d'où ce regroupement.
export function PlayerScoresTable({
  tournamentId,
  gameId,
  anonymizedPlayers,
  referenceMoves,
  moveByTurnAndPlayer,
  avertissementCostMap,
  soloWinners,
  soloEligible,
  canEnterScores,
  resultByPlayer,
}: {
  tournamentId: string;
  gameId: string;
  anonymizedPlayers: { player: Player; label: string }[];
  referenceMoves: ReferenceMove[];
  moveByTurnAndPlayer: Map<string, DuplicateMove>;
  avertissementCostMap: Map<string, boolean>;
  soloWinners: Map<number, string>;
  soloEligible: boolean;
  canEnterScores: boolean;
  resultByPlayer: Map<string, DuplicateResult>;
}) {
  const checkPlayerWordBound = checkPlayerWordAction.bind(null, tournamentId, gameId);

  if (anonymizedPlayers.length === 0) {
    return (
      <p className="text-sm text-black/50 dark:text-white/50">
        Aucun joueur inscrit pour cette partie.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pr-3">Coup</th>
            <th className="py-2 pr-4">Référence</th>
            {anonymizedPlayers.map(({ player, label }) => (
              <th key={player.id} className="py-2 px-2 text-center">
                {label}
              </th>
            ))}
            {canEnterScores && <th className="py-2 pr-2"></th>}
          </tr>
        </thead>
        <tbody>
          {referenceMoves.map((move) => {
            const formId = `turn-${move.turnNumber}`;
            return (
              <tr key={move.turnNumber} className="border-b border-black/5 dark:border-white/5">
                <td className="py-1.5 pr-3 text-black/60 dark:text-white/60">{move.turnNumber}</td>
                <td className="py-1.5 pr-4 whitespace-nowrap">
                  <span className="font-medium">{formatReference(move.row, move.col, move.direction)}</span>{" "}
                  {move.isPass ? "Passe" : move.word ?? "—"}{" "}
                  <span className="text-black/50 dark:text-white/50">({move.points} pts)</span>
                </td>
                {anonymizedPlayers.map(({ player }, playerIndex) => {
                  const prevPlayerId = anonymizedPlayers[playerIndex - 1]?.player.id;
                  const nextPlayerId = anonymizedPlayers[playerIndex + 1]?.player.id;
                  const pm = moveByTurnAndPlayer.get(`${move.turnNumber}:${player.id}`);
                  const costsFive = avertissementCostMap.get(`${move.turnNumber}:${player.id}`) ?? false;
                  const isSolo = soloWinners.get(move.turnNumber) === player.id;
                  const info = moveDisplayInfo(pm, costsFive, isSolo, soloEligible);
                  const penaltyBadge = info.badgeLabel && (
                    <span
                      title={
                        info.badgeLabel === "A"
                          ? info.isFreeAvertissement
                            ? "Avertissement (encore gratuit)"
                            : "Avertissement (hors quota gratuit, -5)"
                          : info.badgeLabel === "P"
                          ? "Pénalité, -5"
                          : "Zéro : points ramenés à 0"
                      }
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        info.isFreeAvertissement
                          ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                          : "bg-red-500/20 text-red-700 dark:text-red-400"
                      }`}
                    >
                      {info.badgeLabel}
                      {info.isFreeAvertissement ? " libre" : info.badgeLabel !== "Z" ? " −5" : ""}
                    </span>
                  );
                  const soloBadge = info.isSolo && soloEligible && (
                    <span
                      title={
                        info.soloConfirmed
                          ? "Solo validé par l'arbitre : +10 points (règlement §3.5)"
                          : "Solo détecté : en attente de validation par l'arbitre pour créditer les +10 points"
                      }
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        info.soloConfirmed
                          ? "bg-moss/15 text-moss dark:bg-moss-light/20 dark:text-moss-light"
                          : "bg-amber-400/25 text-amber-800 dark:text-amber-300"
                      }`}
                    >
                      Solo{info.soloBonus > 0 ? " +10" : ""}
                    </span>
                  );
                  const soloConfirmForm = canEnterScores && soloEligible && info.isSolo && (
                    <form
                      action={toggleSoloConfirmationAction.bind(
                        null,
                        tournamentId,
                        gameId,
                        player.id,
                        move.turnNumber
                      )}
                    >
                      <button
                        type="submit"
                        className={`text-[10px] font-medium underline ${
                          info.soloConfirmed
                            ? "text-black/50 dark:text-white/50"
                            : "text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {info.soloConfirmed ? "Annuler" : "Valider +10"}
                      </button>
                    </form>
                  );
                  const netLine = info.net !== null && (
                    <span className="text-[10px] text-black/50 dark:text-white/50">net {info.net}</span>
                  );
                  const pmReference =
                    pm?.row && pm?.col && pm?.direction ? formatReference(pm.row, pm.col, pm.direction) : null;
                  return (
                    <td key={player.id} className="py-1 px-2 text-center">
                      {canEnterScores ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <PlayerWordChecker
                            playerId={player.id}
                            formId={formId}
                            initialWord={pm?.word ?? ""}
                            initialReference={pmReference ?? ""}
                            checkWord={checkPlayerWordBound.bind(null, move.turnNumber)}
                          />
                          <input
                            id={scoreInputId(move.turnNumber, player.id)}
                            form={formId}
                            type="number"
                            name={`score_${player.id}`}
                            defaultValue={pm?.word ? "" : pm?.points ?? ""}
                            max={move.points}
                            title={`Score saisi à la main, utilisé seulement si le mot ci-dessus est vide. Le top de ce coup est ${move.points} points : aucun score ne peut le dépasser. ← → pour passer au joueur précédent/suivant, Entrée pour donner le top.`}
                            placeholder={pm?.word ? String(pm.points) : "—"}
                            onKeyDown={(e) =>
                              handleScoreKeyDown(e, move.turnNumber, move.points, prevPlayerId, nextPlayerId)
                            }
                            className="w-14 rounded border-2 border-gold/40 dark:border-gold-light/40 px-1 py-0.5 text-center bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light text-sm focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
                          />
                          <select
                            form={formId}
                            name={`penalty_${player.id}`}
                            defaultValue={pm?.penaltyType ?? ""}
                            className="w-14 rounded border border-black/10 dark:border-white/20 bg-transparent text-[10px]"
                          >
                            <option value="">—</option>
                            <option value="AVERTISSEMENT">A</option>
                            <option value="PENALITE">P</option>
                            <option value="ZERO">Z</option>
                          </select>
                          {penaltyBadge}
                          {soloBadge}
                          {soloConfirmForm}
                          {netLine}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <span>
                            {pm?.word && pmReference ? `${pmReference} ${pm.word} — ` : ""}
                            {pm?.points ?? "—"}
                          </span>
                          {penaltyBadge}
                          {soloBadge}
                          {netLine}
                        </div>
                      )}
                    </td>
                  );
                })}
                {canEnterScores && (
                  <td className="py-1.5 pr-2">
                    <form
                      id={formId}
                      action={saveTurnScoresAction.bind(null, tournamentId, gameId, move.turnNumber)}
                    >
                      <button
                        type="submit"
                        className="rounded bg-emerald-700 text-white px-2 py-1 text-xs whitespace-nowrap"
                      >
                        Valider
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            );
          })}
          {referenceMoves.length === 0 && (
            <tr>
              <td
                colSpan={2 + anonymizedPlayers.length + (canEnterScores ? 1 : 0)}
                className="py-2 text-black/50 dark:text-white/50"
              >
                Aucun coup de référence saisi pour l&apos;instant.
              </td>
            </tr>
          )}
        </tbody>
        {referenceMoves.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-black/20 dark:border-white/20 font-semibold">
              <td colSpan={2} className="py-2 pr-4">
                Total (net)
              </td>
              {anonymizedPlayers.map(({ player }) => {
                const result = resultByPlayer.get(player.id);
                const net = result ? result.score - result.penalty : null;
                return (
                  <td key={player.id} className="py-2 px-2 text-center">
                    {net ?? "—"}
                  </td>
                );
              })}
              {canEnterScores && <td></td>}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
