import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: {
    default: "ChatNova - WhatsApp & Meta Lead Automation",
    template: "%s | ChatNova",
  },
  description:
    "Reply to Facebook and Instagram lead ads on WhatsApp in seconds. Shared team inbox, no-code chatbots, broadcasts and integrations on the official WhatsApp Business API.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
