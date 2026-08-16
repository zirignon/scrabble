import "server-only";

import { Resend } from "resend";

let client: Resend | null = null;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }
  if (!client) {
    client = new Resend(apiKey);
  }
  return client;
}

// Adresse d'expédition de test fournie par Resend, utilisable sans domaine
// vérifié — à remplacer par une adresse sur un domaine vérifié pour un envoi
// en production à des destinataires autres que le titulaire du compte Resend.
const FROM_ADDRESS = "Scrabble Tournois <onboarding@resend.dev>";

export async function sendTwoFactorCodeEmail(to: string, code: string) {
  const { error } = await getResendClient().emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `${code} — votre code de connexion Scrabble Tournois`,
    text: `Votre code de connexion est : ${code}\n\nCe code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
  });
  if (error) {
    throw new Error(`Échec de l'envoi de l'email 2FA : ${error.message}`);
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const { error } = await getResendClient().emails.send({
    from: FROM_ADDRESS,
    to,
    subject: "Réinitialisation de votre mot de passe — Scrabble Tournois",
    text: `Vous avez demandé la réinitialisation de votre mot de passe.\n\nCliquez sur ce lien pour choisir un nouveau mot de passe (valable 1 heure) :\n${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe actuel reste inchangé.`,
  });
  if (error) {
    throw new Error(`Échec de l'envoi de l'email de réinitialisation : ${error.message}`);
  }
}
