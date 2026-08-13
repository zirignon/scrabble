import { prisma } from "@/lib/prisma";

export interface PlayerImportRow {
  lastName: string;
  firstName: string;
  licenseNumber: string;
  eloDuplicate: number | null;
  classification: string | null;
  clubCode: string | null;
  category: string | null;
  nationality: string | null;
  federation: string | null;
  eloClassic: number | null;
  classificationClassic: string | null;
  coefficientClassic: number | null;
}

function toNullableInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

function toNullable(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

// Format fédéral fixe, sans en-tête, 12 colonnes séparées par ";" :
// Nom;Prénoms;Licence;Elo duplicate;Série duplicate;Club;Catégorie;
// Nationalité;Fédération;Elo classique;Série classique;Coefficient classique
export function parsePlayersCsvChunk(text: string): PlayerImportRow[] {
  const rows: PlayerImportRow[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (!line.trim()) continue;
    const cells = line.split(";");
    if (cells.length < 12) continue;
    const licenseNumber = cells[2].trim();
    if (!/^\d+$/.test(licenseNumber)) continue; // ignore une éventuelle ligne d'en-tête
    rows.push({
      lastName: cells[0].trim(),
      firstName: cells[1].trim(),
      licenseNumber,
      eloDuplicate: toNullableInt(cells[3]),
      classification: toNullable(cells[4]),
      clubCode: toNullable(cells[5]),
      category: toNullable(cells[6]),
      nationality: toNullable(cells[7]),
      federation: toNullable(cells[8]),
      eloClassic: toNullableInt(cells[9]),
      classificationClassic: toNullable(cells[10]),
      coefficientClassic: toNullableInt(cells[11]),
    });
  }
  return rows;
}

export interface PlayerImportSummary {
  totalRows: number;
  created: number;
  updated: number;
  clubsCreated: number;
  errors: string[];
}

const UPSERT_CONCURRENCY = 25;

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// Importe un bloc de lignes du fichier fédéral : crée les clubs manquants
// (identifiés par leur code) puis fait un upsert des joueurs par numéro de
// licence (clé unique). Conçu pour être appelé plusieurs fois de suite avec
// des blocs successifs du même fichier (voir PlayerImportForm).
export async function importPlayersCsvChunk(text: string): Promise<PlayerImportSummary> {
  const rows = parsePlayersCsvChunk(text);
  const summary: PlayerImportSummary = {
    totalRows: rows.length,
    created: 0,
    updated: 0,
    clubsCreated: 0,
    errors: [],
  };
  if (rows.length === 0) return summary;

  const clubCodes = [...new Set(rows.map((r) => r.clubCode).filter((c): c is string => c !== null))];
  const existingClubs = await prisma.club.findMany({
    where: { code: { in: clubCodes } },
  });
  const clubCodeToId = new Map(existingClubs.map((c) => [c.code as string, c.id]));
  for (const code of clubCodes) {
    if (clubCodeToId.has(code)) continue;
    try {
      const club = await prisma.club.upsert({
        where: { code },
        create: { name: code, code },
        update: {},
      });
      clubCodeToId.set(code, club.id);
      summary.clubsCreated += 1;
    } catch {
      // Un club portant ce nom existe déjà (créé manuellement, ou par un
      // import précédent/concurrent avant que le code ne lui soit associé) :
      // on le retrouve par son nom et on lui attache ce code, plutôt que de
      // faire échouer l'import des joueurs de ce club.
      try {
        const existing = await prisma.club.findUnique({ where: { name: code } });
        if (!existing) throw new Error("introuvable même par nom");
        if (!existing.code) {
          await prisma.club.update({ where: { id: existing.id }, data: { code } });
        }
        clubCodeToId.set(code, existing.id);
      } catch (fallbackErr) {
        summary.errors.push(
          `Club ${code} : ${fallbackErr instanceof Error ? fallbackErr.message : "erreur inconnue"}`
        );
      }
    }
  }

  const licenseNumbers = rows.map((r) => r.licenseNumber);
  const existingPlayers = await prisma.player.findMany({
    where: { licenseNumber: { in: licenseNumbers } },
    select: { licenseNumber: true },
  });
  const existingLicenseNumbers = new Set(existingPlayers.map((p) => p.licenseNumber));

  await mapWithConcurrency(rows, UPSERT_CONCURRENCY, async (row) => {
    const clubId = row.clubCode ? clubCodeToId.get(row.clubCode) ?? null : null;
    const data = {
      firstName: row.firstName,
      lastName: row.lastName,
      licenseNumber: row.licenseNumber,
      clubId,
      category: row.category,
      classification: row.classification,
      classificationClassic: row.classificationClassic,
      coefficientClassic: row.coefficientClassic,
      eloDuplicate: row.eloDuplicate,
      eloClassic: row.eloClassic,
      nationality: row.nationality,
      federation: row.federation,
    };
    try {
      await prisma.player.upsert({
        where: { licenseNumber: row.licenseNumber },
        create: data,
        update: data,
      });
      if (existingLicenseNumbers.has(row.licenseNumber)) {
        summary.updated += 1;
      } else {
        summary.created += 1;
      }
    } catch (err) {
      summary.errors.push(
        `${row.lastName} ${row.firstName} (${row.licenseNumber}) : ${err instanceof Error ? err.message : "erreur inconnue"}`
      );
    }
  });

  return summary;
}
