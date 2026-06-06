import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "择日飞升 GM 后台",
  description: "九塔封魔 GM 后台骨架",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
