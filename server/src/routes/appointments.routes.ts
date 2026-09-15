import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { badRequest, unauthorized } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import {
  cancelAppointment,
  confirmByToken,
  createBooking,
  listMyAppointments,
  resendConfirmation,
} from "../services/booking";

const router = Router();

const bookingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many booking attempts. Try again later." } },
});

const resendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many resend attempts. Try again later." } },
});

const createSchema = z.object({
  counsellorId: z.string().uuid(),
  startsAt: z.string().datetime(),
  note: z.string().trim().max(500).optional().nullable(),
});

router.post(
  "/",
  requireAuth,
  bookingLimiter,
  asyncHandler(async (req, res) => {
    if (!req.session) throw unauthorized();
    if (req.session.role === "counsellor") {
      throw badRequest("counsellors_cannot_book", "Counsellor accounts cannot book appointments");
    }

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("invalid_body", "Check the counsellor and time you selected");

    const { appointmentId, expiresAt, emailSent } = await createBooking(
      req.session,
      parsed.data.counsellorId,
      parsed.data.startsAt,
      parsed.data.note?.trim() || null
    );

    res.status(201).json({ appointmentId, expiresAt, status: "pending", emailSent });
  })
);

const confirmSchema = z.object({ token: z.string().min(10) });

router.post(
  "/confirm",
  asyncHandler(async (req, res) => {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("invalid_body", "Missing confirmation token");
    const result = await confirmByToken(parsed.data.token);
    res.json({
      appointmentId: result.appointmentId,
      status: "confirmed",
      counsellorName: result.counsellorName,
      startsAt: result.startsAt,
      endsAt: result.endsAt,
    });
  })
);

router.post(
  "/:id/resend",
  requireAuth,
  resendLimiter,
  asyncHandler(async (req, res) => {
    if (!req.session) throw unauthorized();
    const { expiresAt, emailSent } = await resendConfirmation(req.session, req.params.id);
    res.json({ expiresAt, emailSent });
  })
);

router.post(
  "/:id/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.session) throw unauthorized();
    await cancelAppointment(req.session, req.params.id);
    res.json({ appointmentId: req.params.id, status: "cancelled" });
  })
);

router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.session) throw unauthorized();
    const appointments = await listMyAppointments(req.session);
    res.json({ appointments });
  })
);

export default router;
