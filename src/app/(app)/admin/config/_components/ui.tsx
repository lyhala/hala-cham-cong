// Ô nhập dùng chung trong màn Cấu hình (server component, không có state).

export function Field({ label, name, defaultValue, type = "text", hint, width }: { label: string; name: string; defaultValue?: string | number | null; type?: string; hint?: string; width?: number }) {
  return (
    <div className="field" style={width ? { maxWidth: width } : undefined}>
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={defaultValue ?? ""} step={type === "number" ? "any" : undefined} />
      {hint && <small style={{ color: "var(--text-3)", fontSize: 11.5 }}>{hint}</small>}
    </div>
  );
}

export function Check({ name, label, hint, defaultChecked, value }: { name: string; label: string; hint?: string; defaultChecked?: boolean; value?: string }) {
  return (
    <label className="check-row">
      <input type="checkbox" name={name} value={value ?? "on"} defaultChecked={defaultChecked} />
      <span>{label}{hint && <small>{hint}</small>}</span>
    </label>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="section-title" style={{ marginTop: 0 }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.6 }}>{hint}</div>}
      {children}
    </div>
  );
}
