import pool from "./db";

const migrations: { name: string; sql: string }[] = [
  {
    name: "add_last_ip_to_devices",
    sql: "ALTER TABLE devices ADD COLUMN last_ip VARCHAR(45) NULL AFTER last_seen",
  },
  {
    name: "trim_sensor_data_to_150_per_sensor",
    sql: `DELETE FROM sensor_data WHERE id NOT IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY id DESC) AS rn
        FROM sensor_data
      ) t
      WHERE rn <= 150
    )`,
  },
];

export async function runMigrations(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(128) PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const m of migrations) {
      const [rows] = await conn.execute<any[]>(
        "SELECT name FROM _migrations WHERE name = ?",
        [m.name]
      );
      if (rows.length > 0) continue;

      await conn.execute(m.sql);
      await conn.execute("INSERT INTO _migrations (name) VALUES (?)", [m.name]);
      console.log(`[migrate] applied: ${m.name}`);
    }
  } catch (err: any) {
    console.error("[migrate] error:", err.message);
  } finally {
    conn.release();
  }
}
