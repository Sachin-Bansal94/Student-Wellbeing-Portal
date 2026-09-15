import { pool, withTransaction } from "./pool";

type SeedRule = { weekday: number; start: string; end: string };

type SeedCounsellor = {
  email: string | null;
  fullName: string;
  title: string;
  venue: string;
  room: string;
  displayOrder: number;
  rules: SeedRule[];
};

const MON_TO_FRI = [1, 2, 3, 4, 5];
const MON_TO_SAT = [1, 2, 3, 4, 5, 6];

function block(weekdays: number[], start: string, end: string): SeedRule[] {
  return weekdays.map((weekday) => ({ weekday, start, end }));
}

const COUNSELLORS: SeedCounsellor[] = [
  {
    email: "aishwaryarao@iitism.ac.in",
    fullName: "Ms. Aishwarya Rao",
    title: "Psychologist (M.A.)",
    venue: "Health Center, IIT (ISM) Dhanbad",
    room: "Room No. 204, 2nd Floor",
    displayOrder: 1,
    rules: [
      ...block(MON_TO_FRI, "09:30", "13:30"),
      ...block(MON_TO_FRI, "15:30", "19:30"),
    ],
  },
  {
    email: "neethuat@iitism.ac.in",
    fullName: "Ms. Neethu AT",
    title: "Psychologist (M.A.)",
    venue: "Health Center, IIT (ISM) Dhanbad",
    room: "Room No. 109, 1st Floor",
    displayOrder: 2,
    rules: [
      ...block(MON_TO_SAT, "09:30", "13:30"),
      ...block(MON_TO_SAT, "15:30", "19:30"),
    ],
  },
  {
    email: null,
    fullName: "Dr. Shilpi Kumari",
    title: "M.D. (Psychiatrist)",
    venue: "Health Center, IIT (ISM) Dhanbad",
    room: "Room No. 206, 2nd Floor",
    displayOrder: 3,
    rules: [{ weekday: 4, start: "15:30", end: "17:30" }],
  },
];

async function run() {
  await withTransaction(async (client) => {
    for (const c of COUNSELLORS) {
      const existing = await client.query<{ id: string }>(
        c.email
          ? "SELECT id FROM counsellors WHERE email = $1"
          : "SELECT id FROM counsellors WHERE full_name = $1",
        [c.email ?? c.fullName]
      );

      let counsellorId: string;

      if (existing.rowCount) {
        counsellorId = existing.rows[0].id;
        await client.query(
          `UPDATE counsellors
             SET full_name = $2, title = $3, venue = $4, room = $5,
                 display_order = $6, is_active = TRUE
           WHERE id = $1`,
          [counsellorId, c.fullName, c.title, c.venue, c.room, c.displayOrder]
        );
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO counsellors (email, full_name, title, venue, room, display_order)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [c.email, c.fullName, c.title, c.venue, c.room, c.displayOrder]
        );
        counsellorId = inserted.rows[0].id;
      }

      await client.query("DELETE FROM availability_rules WHERE counsellor_id = $1", [counsellorId]);

      for (const rule of c.rules) {
        await client.query(
          `INSERT INTO availability_rules (counsellor_id, weekday, start_time, end_time)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ON CONSTRAINT availability_rules_unique DO NOTHING`,
          [counsellorId, rule.weekday, rule.start, rule.end]
        );
      }

      console.log(`seeded ${c.fullName} (${c.rules.length} weekly blocks)`);
    }
  });

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
