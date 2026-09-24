import { redirect } from "next/navigation";
import { homePathFor, requireUser } from "@/lib/auth/session";

// Trang gốc "/" → chuyển về trang chủ theo role.
export default async function RootPage() {
  const user = await requireUser();
  redirect(homePathFor(user.role));
}
