import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-sm py-16 px-4">
      <h1 className="font-heading text-2xl font-semibold text-navy dark:text-navy-light mb-2">
        Mot de passe oublié
      </h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        Indiquez votre email : si un compte existe, vous recevrez un lien
        pour choisir un nouveau mot de passe.
      </p>
      <ForgotPasswordForm />
      <p className="mt-6 text-sm text-black/60 dark:text-white/60">
        <Link href="/login" className="text-emerald-700 underline">
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
