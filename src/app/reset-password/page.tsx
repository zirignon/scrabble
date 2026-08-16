import Link from "next/link";
import { hashResetToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

function InvalidLink() {
  return (
    <div className="mx-auto max-w-sm py-16 px-4">
      <h1 className="font-heading text-2xl font-semibold text-navy dark:text-navy-light mb-2">
        Lien invalide
      </h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Ce lien de réinitialisation est invalide, a déjà été utilisé, ou a
        expiré (il n&apos;est valable qu&apos;une heure).{" "}
        <Link href="/forgot-password" className="text-emerald-700 underline">
          Redemander un lien
        </Link>
        .
      </p>
    </div>
  );
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) return <InvalidLink />;

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
  });
  const valid = resetToken && !resetToken.consumedAt && resetToken.expiresAt > new Date();
  if (!valid) return <InvalidLink />;

  return (
    <div className="mx-auto max-w-sm py-16 px-4">
      <h1 className="font-heading text-2xl font-semibold text-navy dark:text-navy-light mb-2">
        Nouveau mot de passe
      </h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        Choisissez un nouveau mot de passe (8 caractères minimum) pour votre
        compte.
      </p>
      <ResetPasswordForm token={token} />
    </div>
  );
}
