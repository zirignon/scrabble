// Crée (ou met à jour le mot de passe d') un compte administrateur, sans
// les données de démonstration du seed. À utiliser en production, où l'on
// ne veut ni les identifiants publics du seed (admin@scrabble.local /
// admin1234) ni les clubs/joueurs/tournois de démo.
//
// Usage : npx tsx prisma/createAdmin.ts <email> <mot de passe> "<Nom affiché>"
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password || !name) {
    console.error(
      'Usage : npx tsx prisma/createAdmin.ts <email> <mot de passe> "<Nom affiché>"'
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Le mot de passe doit faire au moins 8 caractères.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name, role: "ADMIN" },
    create: { email, name, role: "ADMIN", passwordHash },
  });

  console.log(`Compte administrateur prêt : ${user.email} (${user.name}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
