ALTER TABLE "MovimientoCuenta" ADD COLUMN "userId" INTEGER;

CREATE INDEX "MovimientoCuenta_userId_idx" ON "MovimientoCuenta"("userId");

ALTER TABLE "MovimientoCuenta"
ADD CONSTRAINT "MovimientoCuenta_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
