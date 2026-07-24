import { TournamentForm } from "@/components/admin/TournamentForm";

export default function NewTournamentPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Créer un tournoi</h1>
      <TournamentForm />
    </div>
  );
}
