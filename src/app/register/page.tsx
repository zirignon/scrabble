import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-sm py-16 px-4">
      <h1 className="text-2xl font-semibold mb-6">Créer un compte</h1>
      <RegisterForm />
      <p className="mt-6 text-sm text-black/60 dark:text-white/60">
        Déjà inscrit ?{" "}
        <Link href="/login" className="text-emerald-700 underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
