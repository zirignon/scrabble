import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateRoundRobinRounds } from "../src/lib/classic/pairing";
import { importDictionaryWords } from "../src/lib/dictionary";
import { canRunDemoSeed } from "../src/lib/security";

const prisma = new PrismaClient();

async function hash(password: string) {
  return bcrypt.hash(password, 10);
}

async function main() {
  if (!canRunDemoSeed(process.env.NODE_ENV)) {
    throw new Error("Le seed de démonstration est interdit en production.");
  }
  console.log("Seeding database...");

  const admin = await prisma.user.upsert({
    where: { email: "admin@scrabble.local" },
    update: {},
    create: {
      email: "admin@scrabble.local",
      name: "Administrateur",
      role: "ADMIN",
      passwordHash: await hash("admin1234"),
    },
  });

  const clubNames = [
    { name: "Scrabble Club de Paris", city: "Paris" },
    { name: "Scrabble Club de Lyon", city: "Lyon" },
    { name: "Scrabble Club de Marseille", city: "Marseille" },
  ];
  const clubs = [];
  for (const c of clubNames) {
    clubs.push(
      await prisma.club.upsert({
        where: { name: c.name },
        update: {},
        create: c,
      })
    );
  }

  const playerNames: [string, string][] = [
    ["Alice", "Martin"],
    ["Benoît", "Dubois"],
    ["Chloé", "Bernard"],
    ["David", "Thomas"],
    ["Emma", "Petit"],
    ["Farid", "Robert"],
    ["Gaëlle", "Richard"],
    ["Hugo", "Durand"],
  ];

  const players = [];
  for (let i = 0; i < playerNames.length; i++) {
    const [firstName, lastName] = playerNames[i];
    const club = clubs[i % clubs.length];
    const existing = await prisma.player.findFirst({
      where: { firstName, lastName },
    });
    players.push(
      existing ??
        (await prisma.player.create({
          data: {
            firstName,
            lastName,
            clubId: club.id,
            category: i % 3 === 0 ? "Senior" : "Open",
          },
        }))
    );
  }

  // Tournoi classique (round-robin) déjà en cours avec quelques résultats saisis
  const classicSlug = "championnat-classique-demo";
  let classic = await prisma.tournament.findUnique({ where: { slug: classicSlug } });
  if (!classic) {
    classic = await prisma.tournament.create({
      data: {
        name: "Championnat classique de démonstration",
        slug: classicSlug,
        type: "CLASSIC",
        format: "ROUND_ROBIN",
        venue: "Salle des fêtes, Paris",
        description: "Tournoi de démonstration en round-robin, toutes rondes.",
        startDate: new Date(),
        status: "IN_PROGRESS",
        organizerId: admin.id,
      },
    });

    const classicPlayers = players.slice(0, 6);
    for (const p of classicPlayers) {
      await prisma.registration.create({
        data: { tournamentId: classic.id, playerId: p.id, status: "CONFIRMED" },
      });
    }

    const rounds = generateRoundRobinRounds(classicPlayers.map((p) => p.id));
    for (let i = 0; i < rounds.length; i++) {
      const round = await prisma.round.create({
        data: { tournamentId: classic.id, number: i + 1 },
      });
      let table = 1;
      for (const pairing of rounds[i]) {
        const isBye = pairing.away === null;
        const played = i === 0; // seed some results only for round 1
        await prisma.match.create({
          data: {
            roundId: round.id,
            table: isBye ? null : table++,
            homePlayerId: pairing.home,
            awayPlayerId: pairing.away,
            isBye,
            status: isBye ? "PLAYED" : played ? "PLAYED" : "SCHEDULED",
            homeScore: !isBye && played ? 420 + Math.floor(Math.random() * 80) : null,
            awayScore: !isBye && played ? 380 + Math.floor(Math.random() * 80) : null,
          },
        });
      }
    }
  }

  // Tournoi duplicate avec quelques parties et scores
  const duplicateSlug = "festival-duplicate-demo";
  let duplicate = await prisma.tournament.findUnique({ where: { slug: duplicateSlug } });
  if (!duplicate) {
    duplicate = await prisma.tournament.create({
      data: {
        name: "Festival duplicate de démonstration",
        slug: duplicateSlug,
        type: "DUPLICATE",
        venue: "Centre culturel, Lyon",
        description: "Tournoi duplicate de démonstration, plusieurs parties, classement cumulé.",
        startDate: new Date(),
        status: "IN_PROGRESS",
        organizerId: admin.id,
      },
    });

    const duplicatePlayers = players.slice(2, 8);
    for (const p of duplicatePlayers) {
      await prisma.registration.create({
        data: { tournamentId: duplicate.id, playerId: p.id, status: "CONFIRMED" },
      });
    }

    for (let g = 1; g <= 3; g++) {
      const game = await prisma.game.create({
        data: { tournamentId: duplicate.id, number: g, playedAt: new Date() },
      });
      if (g <= 2) {
        for (const p of duplicatePlayers) {
          await prisma.duplicateResult.create({
            data: {
              gameId: game.id,
              playerId: p.id,
              score: 30 + Math.floor(Math.random() * 40),
              penalty: Math.random() < 0.1 ? 5 : 0,
            },
          });
        }
      }
    }
  }

  const dictionaryPath = path.join(__dirname, "data", "ods9.txt");
  const dictionaryText = readFileSync(dictionaryPath, "utf-8");
  const { total } = await importDictionaryWords(dictionaryText);
  console.log(`Dictionnaire ODS9 : ${total} mots chargés.`);

  console.log("Seed terminé.");
  console.log("Connexion admin : admin@scrabble.local / admin1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
