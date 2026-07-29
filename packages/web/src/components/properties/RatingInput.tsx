export function RatingInput({ max, value, onChange }: { max: number; value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star === value ? 0 : star)}
          className={`text-lg leading-none ${star <= value ? "text-amber-400" : "text-ink-muted/40"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
