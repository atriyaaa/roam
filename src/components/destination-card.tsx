import { Card, CardContent } from "@/components/ui/card";

type DestinationCardProps = {
  city: string;
  country: string;
  days: string;
  detail: string;
  colour: string;
  number: string;
};

export function DestinationCard({
  city,
  country,
  days,
  detail,
  colour,
  number,
}: DestinationCardProps) {
  return (
    <article aria-label={`${city}, ${days}`}>
      <Card className="h-full">
        <div
          className={`${colour} flex h-40 items-end justify-between p-6`}
        >
          <span
            aria-hidden="true"
            className="text-6xl font-semibold tracking-tighter text-foreground/20"
          >
            {number}
          </span>

          <span className="rounded-full bg-white/75 px-3 py-1.5 text-xs font-medium">
            {days}
          </span>
        </div>

        <CardContent>
          <p className="text-xs font-medium uppercase tracking-widest text-muted">
            {country}
          </p>

          <h3 className="mt-2 text-2xl font-semibold">
            {city}
          </h3>

          <p className="mt-3 text-sm leading-relaxed text-muted">
            {detail}
          </p>
        </CardContent>
      </Card>
    </article>
  );
}