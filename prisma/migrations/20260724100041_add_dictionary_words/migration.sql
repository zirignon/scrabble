-- AlterTable
ALTER TABLE "DuplicateMove" ADD COLUMN     "dictionaryValid" BOOLEAN;

-- CreateTable
CREATE TABLE "DictionaryWord" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,

    CONSTRAINT "DictionaryWord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryWord_word_key" ON "DictionaryWord"("word");
