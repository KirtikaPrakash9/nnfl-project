import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sign Language Detector",
  description:
    "Real-time sign language recognition using MediaPipe Holistic and an LSTM neural network.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
