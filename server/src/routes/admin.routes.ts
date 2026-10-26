import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { validateUuidParams } from "../lib/params";
import { badRequest } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  CounsellorListRecord,
  createCounsellor,
  getCounsellorRecord,
  listAllCounsellors,
  updateCounsellor,
} from "../services/counsellorAdmin";
import { getAdminStats, listAppointmentsForAdmin } from "../services/adminReports";
import { cancelAppointmentAsAdmin } from "../services/booking";
import {
  addException,
  addRule,
  listExceptions,
  listRules,
  removeException,
  removeRule,
} from "../services/availabilityAdmin";
import { todayIstISO } from "../lib/ist";

const router = Router();

validateUuidParams(router, "id", "ruleId", "exceptionId");

// Every route in this file is admin-only, with authority re-read from the database and the
// ADMIN_EMAILS allowlist on each request rather than trusted from the session cookie.
router.use(requireAuth, requireRole("admin"));

function toAdminCounsellor(c: Omit<CounsellorListRecord, "upcoming_count"> & { upcoming_count?: number }) {
  return {
    id: c.id,
    email: c.email,
    fullName: c.full_name,
    title: c.title,
    venue: c.venue,
    room: c.room,
    slotMinutes: c.slot_minutes,
    isActive: c.is_active,
    displayOrder: c.display_order,
    // Whether the record has been claimed by a verified account yet (onboarding case B).
    linkedAccount: c.user_id !== null,
    upcomingCount: c.upcoming_count ?? 0,
  };
}

router.get(
  "/counsellors",
  asyncHandler(async (_req, res) => {
    const counsellors = await listAllCounsellors();
    res.json({ counsellors: counsellors.map(toAdminCounsellor) });
  })
);

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const createSchema = z.object({
  email: z.string().trim().email().nullable().optional(),
  fullName: z.string().trim().min(1).max(120),
  title: optionalText(120),
  venue: optionalText(160),
  room: optionalText(120),
  slotMinutes: z.coerce.number().int().min(5).max(20).optional(),
  displayOrder: z.coerce.number().int().min(0).max(999).optional(),
});

router.post(
  "/counsellors",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("invalid_body", "Check the counsellor details");

    const { counsellor, linkedExistingUser } = await createCounsellor({
      email: parsed.data.email ?? null,
      fullName: parsed.data.fullName,
      title: parsed.data.title ?? null,
      venue: parsed.data.venue ?? null,
      room: parsed.data.room ?? null,
      slotMinutes: parsed.data.slotMinutes ?? 20,
      displayOrder: parsed.data.displayOrder ?? 0,
    });

    res.status(201).json({ counsellor: toAdminCounsellor(counsellor), linkedExistingUser });
  })
);

const patchSchema = createSchema.partial().extend({ isActive: z.boolean().optional() });

router.patch(
  "/counsellors/:id",
  asyncHandler(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("invalid_body", "Check the counsellor details");

    const counsellor = await updateCounsellor(req.params.id, parsed.data);
    res.json({ counsellor: toAdminCounsellor(counsellor) });
  })
);

// Deliberately no DELETE route: appointments.counsellor_id cascades, so deleting a counsellor
// would destroy their appointment history. Removal is PATCH { isActive: false }.

router.get(
  "/counsellors/:id/availability-rules",
  asyncHandler(async (req, res) => {
    await getCounsellorRecord(req.params.id);
    res.json({ rules: await listRules(req.params.id) });
  })
);

const ruleSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

router.post(
  "/counsellors/:id/availability-rules",
  asyncHandler(async (req, res) => {
    const parsed = ruleSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("invalid_body", "Check the day and times");
    await getCounsellorRecord(req.params.id);
    const rule = await addRule(
      req.params.id,
      parsed.data.weekday,
      parsed.data.startTime,
      parsed.data.endTime
    );
    res.status(201).json({ rule });
  })
);

router.delete(
  "/counsellors/:id/availability-rules/:ruleId",
  asyncHandler(async (req, res) => {
    await removeRule(req.params.id, req.params.ruleId);
    res.json({ ok: true });
  })
);

router.get(
  "/counsellors/:id/exceptions",
  asyncHandler(async (req, res) => {
    await getCounsellorRecord(req.params.id);
    const from = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.from);
    res.json({
      exceptions: await listExceptions(req.params.id, from.success ? from.data : todayIstISO()),
    });
  })
);

const exceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["blocked", "extra"]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  reason: z.string().trim().max(200).nullable().optional(),
});

router.post(
  "/counsellors/:id/exceptions",
  asyncHandler(async (req, res) => {
    const parsed = exceptionSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("invalid_body", "Check the date and times");
    await getCounsellorRecord(req.params.id);
    const exception = await addException(req.params.id, {
      date: parsed.data.date,
      kind: parsed.data.kind,
      startTime: parsed.data.startTime ?? null,
      endTime: parsed.data.endTime ?? null,
      reason: parsed.data.reason ?? null,
    });
    res.status(201).json({ exception });
  })
);

router.delete(
  "/counsellors/:id/exceptions/:exceptionId",
  asyncHandler(async (req, res) => {
    await removeException(req.params.id, req.params.exceptionId);
    res.json({ ok: true });
  })
);

router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    res.json({ stats: await getAdminStats() });
  })
);

const appointmentsQuery = z.object({
  status: z.enum(["pending", "confirmed", "cancelled", "completed", "expired"]).optional(),
  counsellorId: z.string().uuid().optional(),
  scope: z.enum(["upcoming", "past", "all"]).default("upcoming"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

router.get(
  "/appointments",
  asyncHandler(async (req, res) => {
    const parsed = appointmentsQuery.safeParse(req.query);
    if (!parsed.success) throw badRequest("invalid_query", "Check the filters you chose");
    res.json({ appointments: await listAppointmentsForAdmin(parsed.data) });
  })
);

router.post(
  "/appointments/:id/cancel",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw badRequest("invalid_body", "That is not a valid appointment");
    await cancelAppointmentAsAdmin(req.session!.userId, id.data);
    res.json({ appointmentId: id.data, status: "cancelled" });
  })
);

export default router;
