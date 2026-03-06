import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ClientProviders from "@/components/ClientProviders";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: '--font-jetbrains-mono',
});



export const metadata = {
  title: "SyncSpace — Group Schedule Synchronizer",
  description: "Sync KL University timetables to find common free time with your group",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${jetbrainsMono.variable} font-mono`}>
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
