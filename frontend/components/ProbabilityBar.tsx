interface ProbabilityBarProps {
  sign: string;
  probability: number;
  isTop: boolean;
}

export default function ProbabilityBar({
  sign,
  probability,
  isTop,
}: ProbabilityBarProps) {
  const pct = Math.round(probability * 100);

  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span
          className={
            isTop ? "text-green-400 font-semibold" : "text-gray-300"
          }
        >
          {sign}
        </span>
        <span className={isTop ? "text-green-400 font-semibold" : "text-gray-400"}>
          {pct}%
        </span>
      </div>
      <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-200 ${
            isTop ? "bg-green-500" : "bg-blue-600"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
