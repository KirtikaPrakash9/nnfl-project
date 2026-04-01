import DynamicSignDetector from "@/components/DynamicSignDetector";
import { getSigns } from "@/lib/api";

export default async function Home() {
  // Fetch signs from the backend at request time; fall back to defaults
  let signs: string[] = ["hello", "thanks", "iloveyou"];
  try {
    signs = await getSigns();
  } catch {
    // Backend may not be available during build — use defaults
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <span className="text-2xl">🤟</span>
        <div>
          <h1 className="text-xl font-bold text-white leading-none">
            Sign Language Detector
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Real-time recognition · MediaPipe + LSTM
          </p>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 px-4 py-6 max-w-6xl mx-auto w-full">
        <DynamicSignDetector defaultSigns={signs} />
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-3 text-center text-xs text-gray-500">
        Built by Manav Arya &amp; Kiritika Prakash · NNFL Project
      </footer>
    </main>
  );
}
