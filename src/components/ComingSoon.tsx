// Khung trang tạm cho các màn sẽ làm ở module sau.
export function ComingSoon({ title, subtitle, features }: { title: string; subtitle?: string; features: string[] }) {
  return (
    <>
      <h1>{title}</h1>
      {subtitle && <div className="subtitle">{subtitle}</div>}
      <div className="card">
        <span className="badge warn">Đang xây dựng</span>
        <p style={{ margin: "10px 0 6px", color: "var(--text-2)", fontSize: 12.5 }}>
          Màn hình này sẽ được hoàn thiện ở các module tiếp theo, gồm:
        </p>
        <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
          {features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
