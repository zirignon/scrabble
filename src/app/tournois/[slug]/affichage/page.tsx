import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDisplayData } from "@/lib/display";
import { DisplayBoard } from "@/components/DisplayBoard";

export default async function TournamentDisplayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const tournament = await prisma.tournament.findUnique({ where: { slug } });
  if (!tournament) notFound();

  const initialData = await getDisplayData(tournament.id);

  return <DisplayBoard tournamentId={tournament.id} initialData={initialData} />;
}
