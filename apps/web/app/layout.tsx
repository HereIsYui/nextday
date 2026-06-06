import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "择日飞升",
  description: "九塔封魔文字修仙游戏 Web 端",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
