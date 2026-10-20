import "dotenv/config"

export default {
  schema: "prisma/schema.prisma",
  datasource: {
    // process.env (not env()) so `prisma generate` works without a database
    url: process.env.DATABASE_URL ?? "file:./data/app.db",
  },
}
