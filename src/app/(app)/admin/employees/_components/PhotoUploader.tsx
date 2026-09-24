"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { deletePhoto, uploadPhoto } from "../actions";

const MAX_SIDE = 1280; // cạnh dài tối đa sau khi thu nhỏ — đủ rõ cho nhận diện khuôn mặt

/** Thu nhỏ ảnh trên trình duyệt + xoay đúng chiều (ảnh iPhone) → JPEG. */
async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.9),
  );
}

type Props = { employeeId: string; code: string; photoUrl: string | null; initials: string };

// Khối "Ảnh FaceID" trong hồ sơ nhân sự (Admin): xem, tải lên / đổi, xóa ảnh.
export function PhotoUploader({ employeeId, code, photoUrl, initials }: Props) {
  const [state, dispatch, pending] = useActionState(uploadPhoto, undefined);
  const [delState, delDispatch, delPending] = useActionState(deletePhoto, undefined);
  const [localError, setLocalError] = useState<string | null>(null);
  // Ảnh vừa chọn (xem trước ngay, không chờ tải lại trang) / đã xóa
  const [preview, setPreview] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const shownUrl = deleted ? null : (preview ?? photoUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File | undefined) {
    setLocalError(null);
    if (!file) return;
    let blob: Blob;
    try {
      blob = await resizeImage(file);
    } catch {
      setLocalError("Không đọc được ảnh này. Hãy chọn ảnh JPG hoặc PNG.");
      return;
    }
    const fd = new FormData();
    fd.set("employeeId", employeeId);
    fd.set("photo", blob, `${code}.jpg`);
    setPreview(URL.createObjectURL(blob));
    setDeleted(false);
    startTransition(() => dispatch(fd));
    if (inputRef.current) inputRef.current.value = "";
  }

  const error = localError ?? state?.error ?? delState?.error;
  const ok = !error && (state?.ok ? state.message : delState?.ok ? delState.message : null);

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div
        style={{
          width: 96, height: 96, borderRadius: 14, overflow: "hidden", flexShrink: 0,
          background: "var(--navy-soft)", color: "var(--navy)", display: "flex",
          alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700,
        }}
      >
        {shownUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shownUrl} alt="Ảnh FaceID" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          initials
        )}
      </div>
      <div style={{ flex: "1 1 220px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label className="btn sm" style={{ cursor: pending ? "default" : "pointer" }}>
            {pending ? "Đang tải lên..." : shownUrl ? "Đổi ảnh" : "Tải ảnh lên"}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              disabled={pending}
              onChange={(e) => onPick(e.target.files?.[0])}
            />
          </label>
          {shownUrl && (
            <button
              type="button"
              className="btn sm danger"
              disabled={delPending}
              onClick={() => {
                if (!window.confirm("Xóa ảnh của nhân sự này?")) return;
                const fd = new FormData();
                fd.set("employeeId", employeeId);
                setDeleted(true);
                setPreview(null);
                startTransition(() => delDispatch(fd));
              }}
            >
              {delPending ? "..." : "Xóa ảnh"}
            </button>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 8, lineHeight: 1.5 }}>
          Ảnh chụp thẳng, rõ mặt, đủ sáng, không đeo khẩu trang / mũ / kính râm. Ảnh được tự thu nhỏ trước khi lưu.
          <br />
          Tự động đăng ký FaceID lên camera Hanet (MSNV = {code}) sẽ có ở module Hanet.
        </div>
        {error && <div className="warn-box" style={{ marginTop: 8, marginBottom: 0 }}>{error}</div>}
        {ok && <div className="ok-box" style={{ marginTop: 8, marginBottom: 0 }}>{ok}</div>}
      </div>
    </div>
  );
}
