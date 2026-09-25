"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { parseMoney } from "@/lib/format";
import { approveRequest, createRequest, deleteRequest, rejectRequest, withdrawRequest, type Result } from "@/lib/requests-db";
import type { RequestInput } from "@/lib/requests";

// Server action là API công khai: mọi hàm đều tự xác thực người gọi (requireUser) và kiểm tra quyền trong lớp requests-db.

export type RequestActionState = { ok?: boolean; error?: string; message?: string; warning?: string | null } | undefined;

function toState(r: Result): RequestActionState {
  revalidatePath("/requests");
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
  return r.ok ? { ok: true, message: r.message, warning: r.warning ?? null } : { error: r.error };
}

const text = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v || null;
};

export async function createRequestAction(_prev: RequestActionState, fd: FormData): Promise<RequestActionState> {
  const user = await requireUser();
  const input = {
    type: text(fd, "type"),
    leaveSubtype: text(fd, "leaveSubtype"),
    dateFrom: text(fd, "dateFrom"),
    dateTo: text(fd, "dateTo"),
    dayPortion: text(fd, "dayPortion"),
    timeFrom: text(fd, "timeFrom"),
    timeTo: text(fd, "timeTo"),
    amount: parseMoney(fd.get("amount")),
    reason: String(fd.get("reason") ?? ""),
  } as unknown as RequestInput;
  if (!["OT", "LATE", "EARLY_LEAVE", "LEAVE", "WFH", "SALARY_ADVANCE"].includes(input.type)) return { error: "Loại đơn không hợp lệ" };
  if (input.leaveSubtype && !["ANNUAL", "UNPAID", "MARRIAGE", "FUNERAL"].includes(input.leaveSubtype)) return { error: "Loại nghỉ không hợp lệ" };
  if (input.dayPortion && !["FULL", "MORNING", "AFTERNOON"].includes(input.dayPortion)) return { error: "Buổi nghỉ không hợp lệ" };
  return toState(await createRequest(user, input));
}

const idOf = (fd: FormData) => String(fd.get("id") ?? "");

export async function approveRequestAction(_prev: RequestActionState, fd: FormData): Promise<RequestActionState> {
  return toState(await approveRequest(await requireUser(), idOf(fd)));
}

export async function rejectRequestAction(_prev: RequestActionState, fd: FormData): Promise<RequestActionState> {
  return toState(await rejectRequest(await requireUser(), idOf(fd), String(fd.get("reason") ?? "")));
}

export async function withdrawRequestAction(_prev: RequestActionState, fd: FormData): Promise<RequestActionState> {
  return toState(await withdrawRequest(await requireUser(), idOf(fd)));
}

export async function deleteRequestAction(_prev: RequestActionState, fd: FormData): Promise<RequestActionState> {
  return toState(await deleteRequest(await requireUser(), idOf(fd)));
}
