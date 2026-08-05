-- CreateIndex
CREATE UNIQUE INDEX "Document_userId_chunkContentHash_key" ON "Document"("userId", "chunkContentHash");
