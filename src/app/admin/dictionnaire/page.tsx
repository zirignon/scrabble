import { requireRole } from "@/lib/guards";
import { countDictionaryWords } from "@/lib/dictionary";
import { importDictionaryAction, clearDictionaryAction } from "@/lib/actions/dictionary";

export default async function DictionaryPage() {
  await requireRole(["ADMIN"]);
  const total = await countDictionaryWords();

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Dictionnaire</h1>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          Cette liste sert à signaler, lors de la saisie coup par coup en
          duplicate, les mots joués qui n&apos;y figurent pas. Importez votre
          propre liste (par exemple l&apos;ODS dont votre club ou fédération
          possède les droits) : un mot par ligne, avec ou sans accents.
        </p>
      </div>

      <div className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3">
        <p className="text-sm font-medium">
          {total === 0
            ? "Aucun mot importé — la vérification est désactivée."
            : `${total.toLocaleString("fr-FR")} mot(s) chargé(s).`}
        </p>
      </div>

      <form action={importDictionaryAction} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="file" className="text-sm font-medium">
            Fichier texte (un mot par ligne)
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".txt,text/plain"
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="text" className="text-sm font-medium">
            ou coller une liste de mots
          </label>
          <textarea
            id="text"
            name="text"
            rows={6}
            placeholder={"MAISON\nJARDIN\nSCRABBLE..."}
            className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm font-mono"
          />
        </div>
        <button
          type="submit"
          className="self-start rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
        >
          Importer
        </button>
      </form>

      {total > 0 && (
        <form action={clearDictionaryAction}>
          <button type="submit" className="text-sm text-red-600 hover:underline">
            Vider le dictionnaire
          </button>
        </form>
      )}
    </div>
  );
}
