"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ProbabilityBar from "./ProbabilityBar";
import { predictSign } from "@/lib/api";
import type { PredictResponse } from "@/lib/api";

// ── Constants ──────────────────────────────────────────────────────────────

const SEQUENCE_LENGTH = 30;
// CDN base for MediaPipe WASM files — avoids bundling large WASM assets
const MP_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629";
// Minimum ms between consecutive predict calls (sliding-window throttle)
const PREDICT_THROTTLE_MS = 500;

// ── Types ──────────────────────────────────────────────────────────────────

type Landmark3D = { x: number; y: number; z: number };
type Landmark3DV = Landmark3D & { visibility?: number };

interface HolisticResults {
  poseLandmarks?: Landmark3DV[];
  faceLandmarks?: Landmark3D[];
  leftHandLandmarks?: Landmark3D[];
  rightHandLandmarks?: Landmark3D[];
  image: CanvasImageSource;
}

// ── Keypoint extraction — mirrors the Python MediapipeHandler.extract_keypoints
// Pose:  33 × 4 = 132   (x, y, z, visibility)
// Face: 468 × 3 = 1404  (x, y, z)
// LH:    21 × 3 = 63    (x, y, z)
// RH:    21 × 3 = 63    (x, y, z)
// Total: 1662
function extractKeypoints(results: HolisticResults): number[] {
  const pose = results.poseLandmarks
    ? results.poseLandmarks.flatMap((p) => [p.x, p.y, p.z, p.visibility ?? 0])
    : new Array(33 * 4).fill(0);

  const face = results.faceLandmarks
    ? results.faceLandmarks.flatMap((p) => [p.x, p.y, p.z])
    : new Array(468 * 3).fill(0);

  const lh = results.leftHandLandmarks
    ? results.leftHandLandmarks.flatMap((p) => [p.x, p.y, p.z])
    : new Array(21 * 3).fill(0);

  const rh = results.rightHandLandmarks
    ? results.rightHandLandmarks.flatMap((p) => [p.x, p.y, p.z])
    : new Array(21 * 3).fill(0);

  return [...pose, ...face, ...lh, ...rh];
}

// ── Component state types ──────────────────────────────────────────────────

type Status = "loading" | "ready" | "detecting" | "error";

interface Props {
  defaultSigns: string[];
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SignDetector({ defaultSigns }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Mutable refs used inside the onResults callback (avoid stale closures)
  const sequenceRef = useRef<number[][]>([]);
  const isPredictingRef = useRef(false);
  const lastPredictTimeRef = useRef(0);
  const signsRef = useRef<string[]>(defaultSigns);

  const [signs, setSigns] = useState<string[]>(defaultSigns);
  const [signsInput, setSignsInput] = useState(defaultSigns.join(", "));
  const [status, setStatus] = useState<Status>("loading");
  const [frameCount, setFrameCount] = useState(0);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [apiError, setApiError] = useState<string>("");
  const [camError, setCamError] = useState<string>("");

  // Keep signsRef in sync with signs state so the callback always uses current signs
  useEffect(() => {
    signsRef.current = signs;
  }, [signs]);

  const handleSignsSubmit = useCallback(() => {
    const parsed = signsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsed.length > 0) {
      setSigns(parsed);
      setResult(null);
      setApiError("");
    }
  }, [signsInput]);

  // ── MediaPipe initialisation ─────────────────────────────────────────────

  useEffect(() => {
    let cameraInstance: { stop: () => void } | null = null;
    let holisticInstance: { close: () => void } | null = null;
    let cancelled = false;

    const init = async () => {
      try {
        // Dynamic imports — never executed on the server
        const [
          { Holistic, POSE_CONNECTIONS, FACEMESH_TESSELATION, HAND_CONNECTIONS },
          { Camera },
          { drawConnectors, drawLandmarks },
        ] = await Promise.all([
          import("@mediapipe/holistic"),
          import("@mediapipe/camera_utils"),
          import("@mediapipe/drawing_utils"),
        ]);

        if (cancelled || !videoRef.current || !canvasRef.current) return;

        const holistic = new Holistic({
          locateFile: (file: string) => `${MP_CDN}/${file}`,
        });

        holistic.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          refineFaceLandmarks: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        holistic.onResults(async (results: HolisticResults) => {
          if (cancelled) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          // ── Draw video frame + landmarks on canvas ───────────────────────
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

          if (results.faceLandmarks) {
            drawConnectors(ctx, results.faceLandmarks, FACEMESH_TESSELATION, {
              color: "#4285F480",
              lineWidth: 0.5,
            });
          }
          if (results.poseLandmarks) {
            drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
              color: "#34A853",
              lineWidth: 2,
            });
            drawLandmarks(ctx, results.poseLandmarks, {
              color: "#34A853",
              lineWidth: 1,
              radius: 2,
            });
          }
          if (results.leftHandLandmarks) {
            drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, {
              color: "#FBBC05",
              lineWidth: 2,
            });
            drawLandmarks(ctx, results.leftHandLandmarks, {
              color: "#FBBC05",
              lineWidth: 1,
              radius: 3,
            });
          }
          if (results.rightHandLandmarks) {
            drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, {
              color: "#EA4335",
              lineWidth: 2,
            });
            drawLandmarks(ctx, results.rightHandLandmarks, {
              color: "#EA4335",
              lineWidth: 1,
              radius: 3,
            });
          }

          // ── Accumulate keypoints ─────────────────────────────────────────
          const keypoints = extractKeypoints(results);
          sequenceRef.current = [
            ...sequenceRef.current,
            keypoints,
          ].slice(-SEQUENCE_LENGTH);
          setFrameCount(sequenceRef.current.length);

          // ── Predict (throttled, sliding window) ──────────────────────────
          const now = Date.now();
          if (
            sequenceRef.current.length === SEQUENCE_LENGTH &&
            !isPredictingRef.current &&
            now - lastPredictTimeRef.current > PREDICT_THROTTLE_MS
          ) {
            isPredictingRef.current = true;
            lastPredictTimeRef.current = now;
            setStatus("detecting");
            // Snapshot the sequence and signs to avoid race conditions
            const seqSnapshot = sequenceRef.current.slice();
            const signsSnapshot = signsRef.current.slice();
            try {
              const prediction = await predictSign(seqSnapshot, signsSnapshot);
              if (!cancelled) {
                setResult(prediction);
                setApiError("");
              }
            } catch (err) {
              if (!cancelled) {
                setApiError(
                  err instanceof Error ? err.message : "Prediction failed"
                );
              }
            } finally {
              isPredictingRef.current = false;
              if (!cancelled) setStatus("ready");
            }
          }
        });

        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (!cancelled && videoRef.current) {
              await holistic.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480,
        });

        await camera.start();
        holisticInstance = holistic;
        cameraInstance = camera;
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : "Initialisation failed";
          setCamError(msg);
          setStatus("error");
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      cameraInstance?.stop();
      holisticInstance?.close();
    };
  }, []); // Run once on mount — signs are read via signsRef

  // ── Render ───────────────────────────────────────────────────────────────

  const topSign = result
    ? Object.entries(result.probabilities).sort((a, b) => b[1] - a[1])[0]?.[0]
    : null;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* ── Left: webcam + canvas overlay ─────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <div className="relative bg-gray-900 rounded-xl overflow-hidden aspect-video shadow-lg border border-gray-800">
          {/* Hidden video feed used by MediaPipe */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover opacity-0"
            playsInline
            muted
          />
          {/* Canvas where we draw the frame + landmarks */}
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="w-full h-full object-cover"
          />

          {/* Status overlay */}
          <div className="absolute top-3 left-3">
            {status === "loading" && (
              <span className="bg-gray-800/80 text-gray-300 text-xs px-3 py-1 rounded-full animate-pulse">
                Initialising camera…
              </span>
            )}
            {status === "ready" && frameCount < SEQUENCE_LENGTH && (
              <span className="bg-gray-800/80 text-yellow-300 text-xs px-3 py-1 rounded-full">
                Collecting frames {frameCount}/{SEQUENCE_LENGTH}
              </span>
            )}
            {status === "detecting" && (
              <span className="bg-gray-800/80 text-blue-300 text-xs px-3 py-1 rounded-full animate-pulse">
                Detecting…
              </span>
            )}
            {status === "error" && (
              <span className="bg-red-900/80 text-red-300 text-xs px-3 py-1 rounded-full">
                {camError || "Camera error"}
              </span>
            )}
          </div>

          {/* Landmark colour legend */}
          <div className="absolute bottom-3 left-3 flex gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#34A853] inline-block" />
              <span className="text-gray-300">Pose</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4285F4] inline-block" />
              <span className="text-gray-300">Face</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FBBC05] inline-block" />
              <span className="text-gray-300">L Hand</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EA4335] inline-block" />
              <span className="text-gray-300">R Hand</span>
            </span>
          </div>
        </div>

        {/* Instructions */}
        <p className="mt-3 text-xs text-gray-400 leading-relaxed">
          Face the camera and perform one of the signs listed on the right.
          The model collects{" "}
          <span className="text-gray-200">30 frames (~1 second)</span> before
          making a prediction.
        </p>
      </div>

      {/* ── Right: results + config ────────────────────────────────────── */}
      <div className="w-full lg:w-72 flex flex-col gap-4">
        {/* Current prediction */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
            Detected Sign
          </p>
          {result ? (
            <>
              <p className="text-4xl font-bold text-green-400 capitalize mb-1">
                {result.prediction}
              </p>
              <p className="text-sm text-gray-400">
                Confidence{" "}
                <span className="text-white font-semibold">
                  {Math.round(result.confidence * 100)}%
                </span>
              </p>
            </>
          ) : (
            <p className="text-2xl text-gray-600 italic">—</p>
          )}

          {apiError && (
            <p className="mt-2 text-xs text-red-400 break-all">{apiError}</p>
          )}
        </div>

        {/* Probability bars */}
        {result && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">
              Probabilities
            </p>
            {Object.entries(result.probabilities)
              .sort((a, b) => b[1] - a[1])
              .map(([sign, prob]) => (
                <ProbabilityBar
                  key={sign}
                  sign={sign}
                  probability={prob}
                  isTop={sign === topSign}
                />
              ))}
          </div>
        )}

        {/* Signs configuration */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">
            Signs (comma-separated)
          </p>
          <textarea
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-green-600"
            rows={2}
            value={signsInput}
            onChange={(e) => setSignsInput(e.target.value)}
            placeholder="hello, thanks, iloveyou"
          />
          <button
            onClick={handleSignsSubmit}
            className="mt-2 w-full bg-green-700 hover:bg-green-600 active:bg-green-800 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Apply Signs
          </button>
          <p className="mt-2 text-xs text-gray-500">
            Must match the labels the model was trained on (in the same order).
          </p>
        </div>
      </div>
    </div>
  );
}
