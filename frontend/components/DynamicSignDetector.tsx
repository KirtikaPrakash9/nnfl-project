"use client";

import dynamic from "next/dynamic";

// `ssr: false` must live inside a Client Component in Next.js 16+
const SignDetector = dynamic(() => import("./SignDetector"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96 text-gray-400">
      <span className="animate-pulse">Loading detector…</span>
    </div>
  ),
});

export default function DynamicSignDetector({
  defaultSigns,
}: {
  defaultSigns: string[];
}) {
  return <SignDetector defaultSigns={defaultSigns} />;
}
