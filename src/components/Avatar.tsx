import { initials } from "@/lib/format";

type Props = {
  id: string;
  name: string;
  /** Thời điểm cập nhật ảnh (null = chưa có ảnh → hiện chữ cái đầu) */
  photoUpdatedAt?: Date | null;
  size?: number;
  radius?: number | string;
};

export function photoUrl(id: string, updatedAt: Date) {
  return `/api/employees/${id}/photo?v=${updatedAt.getTime()}`;
}

// Ảnh đại diện nhân sự, không có ảnh thì hiện chữ cái đầu của tên.
export function Avatar({ id, name, photoUpdatedAt, size = 30, radius = "50%" }: Props) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38), borderRadius: radius };
  if (photoUpdatedAt) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl(id, photoUpdatedAt)}
        alt={name}
        className="avatar"
        style={{ ...style, objectFit: "cover", padding: 0 }}
        loading="lazy"
      />
    );
  }
  return (
    <div className="avatar" style={style}>
      {initials(name)}
    </div>
  );
}
