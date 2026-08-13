import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarkScan — Phát hiện và xóa hình mờ cục bộ",
  description: "Phát hiện hình mờ và logo trên nhiều ảnh ngay trong trình duyệt, không tải tệp lên máy chủ.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi" suppressHydrationWarning><body>{children}</body></html>;
}
