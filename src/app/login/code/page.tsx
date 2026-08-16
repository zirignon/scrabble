import { redirect } from "next/navigation";
import { getPendingTwoFactorChallengeId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TwoFactorForm } from "@/components/auth/TwoFactorForm";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
}

export default async function TwoFactorPage() {
  const challengeId = await getPendingTwoFactorChallengeId();
  if (!challengeId) {
    redirect("/login");
  }

  const challenge = await prisma.twoFactorChallenge.findUnique({
    where: { id: challengeId },
    include: { user: true },
  });
  if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-sm py-16 px-4">
      <h1 className="font-heading text-2xl font-semibold text-navy dark:text-navy-light mb-2">
        Vérification en deux étapes
      </h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        Un code à 6 chiffres a été envoyé à {maskEmail(challenge.user.email)}. Il expire
        dans 10 minutes.
      </p>
      <TwoFactorForm />
    </div>
  );
}
