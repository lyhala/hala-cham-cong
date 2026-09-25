"use client";

// Form lọc: đổi ô chọn là lọc ngay, không cần bấm nút
export function AutoSubmitForm({ children, ...props }: React.ComponentProps<"form">) {
  return (
    <form
      {...props}
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
