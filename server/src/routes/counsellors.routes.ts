import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { badRequest } from "../lib/errors";
import { getAvailability, listCounsellors } from "../services/availability";
import { requireAuth } from "../middleware/auth";
import { todayIstISO } from "../lib/ist";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const counsellors = await listCounsellors();
    res.json({
      counsellors: counsellors.map((c) => ({
        id: c.id,
        fullName: c.full_name,
        title: c.title,
        venue: c.venue,
        room: c.room,
        slotMinutes: c.slot_minutes,
      })),
    });
  })
);

const availabilityQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.coerce.number().int().min(1).max(14).optional(),
});

router.get(
  "/:id/availability",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = availabilityQuery.safeParse(req.query);
    if (!parsed.success) throw badRequest("invalid_query", "Invalid date range");

    const from = parsed.data.from ?? todayIstISO();
    const days = parsed.data.days ?? 7;

    const { counsellor, days: dayViews } = await getAvailability(req.params.id, from, days);

    res.json({
      counsellor: {
        id: counsellor.id,
        fullName: counsellor.full_name,
        title: counsellor.title,
        venue: counsellor.venue,
        room: counsellor.room,
        slotMinutes: counsellor.slot_minutes,
      },
      days: dayViews,
    });
  })
);

export default router;
