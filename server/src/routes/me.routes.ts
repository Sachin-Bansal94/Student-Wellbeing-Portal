import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { validateUuidParams } from "../lib/params";
import { badRequest, unauthorized } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { getOwnProfile, updateOwnProfile } from "../services/profile";
import { resolveOwnCounsellor } from "../services/counsellorAdmin";
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

validateUuidParams(router, "ruleId", "exceptionId");

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

// `email` and `role` are absent by design — see services/profile.ts. zod strips unknown keys,
// and .strict() makes an attempt to send them an explicit error rather than a silent no-op.
const profilePatchSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    department: optionalText(120),
    admissionNumber: optionalText(40),
    phone: optionalText(30),
  })
  .strict();

router.get(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.session) throw unauthorized();
    res.json({ profile: await getOwnProfile(req.session.userId) });
  })
);

router.patch(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.session) throw unauthorized();
    const parsed = profilePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      const blocked = parsed.error.issues.some((issue) => issue.code === "unrecognized_keys");
      if (blocked) throw badRequest("field_not_editable", "That field cannot be changed here");
      throw badRequest("invalid_body", "Check the details you entered");
    }
    res.json({ profile: await updateOwnProfile(req.session.userId, parsed.data) });
  })
);

/**
 * Counsellor self-service. No counsellor id appears in any path below — the record is always
 * resolved from the session, so acting on another counsellor's availability is impossible.
 */
const counsellorOnly = [requireAuth, requireRole("counsellor")] as const;

router.get(
  "/counsellor",
  ...counsellorOnly,
  asyncHandler(async (req, res) => {
    const counsellor = await resolveOwnCounsellor(req.session!.userId);
    res.json({
      counsellor: {
        id: counsellor.id,
        fullName: counsellor.full_name,
        title: counsellor.title,
        venue: counsellor.venue,
        room: counsellor.room,
        slotMinutes: counsellor.slot_minutes,
        isActive: counsellor.is_active,
      },
    });
  })
);

router.get(
  "/counsellor/availability-rules",
  ...counsellorOnly,
  asyncHandler(async (req, res) => {
    const counsellor = await resolveOwnCounsellor(req.session!.userId);
    res.json({ rules: await listRules(counsellor.id) });
  })
);

const ruleSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

router.post(
  "/counsellor/availability-rules",
  ...counsellorOnly,
  asyncHandler(async (req, res) => {
    const parsed = ruleSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("invalid_body", "Check the day and times");
    const counsellor = await resolveOwnCounsellor(req.session!.userId);
    const rule = await addRule(
      counsellor.id,
      parsed.data.weekday,
      parsed.data.startTime,
      parsed.data.endTime
    );
    res.status(201).json({ rule });
  })
);

router.delete(
  "/counsellor/availability-rules/:ruleId",
  ...counsellorOnly,
  asyncHandler(async (req, res) => {
    const counsellor = await resolveOwnCounsellor(req.session!.userId);
    await removeRule(counsellor.id, req.params.ruleId);
    res.json({ ok: true });
  })
);

router.get(
  "/counsellor/exceptions",
  ...counsellorOnly,
  asyncHandler(async (req, res) => {
    const counsellor = await resolveOwnCounsellor(req.session!.userId);
    const from = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.from);
    res.json({ exceptions: await listExceptions(counsellor.id, from.success ? from.data : todayIstISO()) });
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
  "/counsellor/exceptions",
  ...counsellorOnly,
  asyncHandler(async (req, res) => {
    const parsed = exceptionSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("invalid_body", "Check the date and times");
    const counsellor = await resolveOwnCounsellor(req.session!.userId);
    const exception = await addException(counsellor.id, {
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
  "/counsellor/exceptions/:exceptionId",
  ...counsellorOnly,
  asyncHandler(async (req, res) => {
    const counsellor = await resolveOwnCounsellor(req.session!.userId);
    await removeException(counsellor.id, req.params.exceptionId);
    res.json({ ok: true });
  })
);

export default router;
