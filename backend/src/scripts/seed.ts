import bcrypt from "bcrypt";
import pool from "../config/db";

async function seed() {
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const username = process.env.ADMIN_USERNAME || "admin";

  const hash = await bcrypt.hash(password, 12);

  const [result] = await pool.execute(
    `INSERT IGNORE INTO users (username, password_hash, role) VALUES (?, ?, 'admin')`,
    [username, hash]
  );

  const rows = result as { affectedRows: number };
  if (rows.affectedRows > 0) {
    console.log(`[seed] Admin user '${username}' created.`);
  } else {
    console.log(`[seed] Admin user '${username}' already exists, skipped.`);
  }

  await pool.end();
}

seed().catch((err) => {
  console.error("[seed] Error:", err);
  process.exit(1);
});
