import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm py-16 px-4">
      <h1 className="text-2xl font-semibold mb-6">Connexion</h1>
      <LoginForm />
      <p className="mt-6 text-sm text-black/60 dark:text-white/60">
        Pas encore de compte ?{" "}
        <Link href="/register" className="text-emerald-700 underline">
          Créer un compte joueur
        </Link>
      </p>
    </div>
  );
}
