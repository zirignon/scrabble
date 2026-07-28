import { requireRole, STAFF_ROLES } from "@/lib/guards";
import { TournamentForm } from "@/components/admin/TournamentForm";

export default async function NewTournamentPage() {
  await requireRole(STAFF_ROLES);
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Créer un tournoi</h1>
      <TournamentForm />
    </div>
  );
}
