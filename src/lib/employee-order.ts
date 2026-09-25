// Thứ tự nhân sự thống nhất ở mọi file xuất / bảng: theo MÃ NV từ trên xuống (ADM → NV001 → NV002 → ...),
// không xếp theo tên (alphabet) vì rất lộn xộn. So sánh phần chữ trước, rồi phần số theo giá trị (NV002 < NV010 < NV100 < NV1000).

/** Hàm so sánh mã nhân sự, dùng với Array.sort. */
export function compareEmployeeCodes(a: string, b: string) {
  const split = (s: string) => {
    const m = /^(\D*)(\d*)(.*)$/.exec(s.toUpperCase())!;
    return { prefix: m[1], num: m[2] === "" ? -1 : Number(m[2]), rest: m[3] };
  };
  const x = split(a);
  const y = split(b);
  if (x.prefix !== y.prefix) return x.prefix < y.prefix ? -1 : 1;
  if (x.num !== y.num) return x.num - y.num;
  return x.rest < y.rest ? -1 : x.rest > y.rest ? 1 : 0;
}

/** Sắp xếp danh sách theo mã nhân sự (không đổi mảng gốc). */
export function sortByEmployeeCode<T>(items: T[], codeOf: (item: T) => string) {
  return [...items].sort((a, b) => compareEmployeeCodes(codeOf(a), codeOf(b)));
}