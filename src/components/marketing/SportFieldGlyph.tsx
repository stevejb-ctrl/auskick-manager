import type { SportId } from "@/lib/sports/types";

interface SportFieldGlyphProps {
  sport: SportId;
  /** Line weight in screen pixels; it holds at any size. */
  weight?: number;
  className?: string;
}

/**
 * A sport's field or court as a landscape line drawing (16:10), in
 * currentColor. The homepage's sport tiles, the header's Sports menu and
 * the sport pages tell the sports apart by these, not by colour: ten
 * accents can't stay distinct, ten field markings can.
 *
 * Strokes don't scale (vector-effect), so one drawing reads at 48 px in
 * the menu and at 800 px behind a sport page's hero. Each sport is drawn
 * from its own markings: AFL's oval and 50 m arcs, netball's thirds and
 * goal circles, rugby's try lines and posts (union adds its dashed 5 m
 * lines), soccer's boxes, basketball's keys and three-point arcs,
 * futsal's 6 m D, hockey's shooting circles and 23 m lines, touch's
 * lanes and Oztag's 10 m lines.
 */
export function SportFieldGlyph({ sport, weight = 1.5, className = "" }: SportFieldGlyphProps) {
  const main = { strokeWidth: weight, vectorEffect: "non-scaling-stroke" as const };
  const minor = { strokeWidth: weight * 0.7, vectorEffect: "non-scaling-stroke" as const };
  const dashed = { ...minor, strokeDasharray: `${weight * 2.5} ${weight * 2.5}` };
  return (
    <svg
      viewBox="0 0 160 100"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
      data-sport-field={sport}
    >
      {drawing(sport, main, minor, dashed)}
    </svg>
  );
}

type Stroke = { strokeWidth: number; vectorEffect: "non-scaling-stroke"; strokeDasharray?: string };

// Rugby posts, drawn as a flat H in each in-goal.
const POSTS = "M18 43H10M18 57H10M14 43V57M142 43H150M142 57H150M146 43V57";

function drawing(sport: SportId, main: Stroke, minor: Stroke, dashed: Stroke) {
  switch (sport) {
    case "afl":
      return (
        <>
          <ellipse cx="80" cy="50" rx="74" ry="44" {...main} />
          <rect x="68" y="38" width="24" height="24" {...minor} />
          <circle cx="80" cy="50" r="7" {...minor} />
          <path d="M25.3 27A30 30 0 0 1 25.3 73M134.7 27A30 30 0 0 0 134.7 73" {...main} />
          <path d="M6.5 45h7v10h-7M153.5 45h-7v10h7" {...minor} />
        </>
      );
    case "netball":
      return (
        <>
          <rect x="6" y="14" width="148" height="72" {...main} />
          <path d="M55.3 14V86M104.7 14V86" {...main} />
          <circle cx="80" cy="50" r="4.5" {...minor} />
          <path d="M6 26.2A23.8 23.8 0 0 1 6 73.8M154 26.2A23.8 23.8 0 0 0 154 73.8" {...main} />
        </>
      );
    case "rugby_league":
      return (
        <>
          <rect x="6" y="8" width="148" height="84" {...main} />
          <path d="M18 8V92M142 8V92M80 8V92" {...main} />
          <path d="M42.8 8V92M117.2 8V92" {...minor} />
          <path d="M61.4 8V92M98.6 8V92" {...dashed} />
          <path d={POSTS} {...main} />
        </>
      );
    case "rugby_union":
      return (
        <>
          <rect x="6" y="8" width="148" height="84" {...main} />
          <path d="M18 8V92M142 8V92M80 8V92" {...main} />
          <path d="M45.3 8V92M114.7 8V92" {...minor} />
          <path d="M67.6 8V92M92.4 8V92M18 14H142M18 86H142" {...dashed} />
          <path d={POSTS} {...main} />
        </>
      );
    case "soccer":
      return (
        <>
          <rect x="6" y="8" width="148" height="84" {...main} />
          <path d="M80 8V92" {...main} />
          <circle cx="80" cy="50" r="12" {...minor} />
          <path d="M6 28h22v44H6M154 28h-22v44h22" {...minor} />
          <path d="M6 40h8v20H6M154 40h-8v20h8" {...minor} />
          <path d="M6 45H2v10h4M154 45h4v10h-4" {...minor} />
        </>
      );
    case "basketball":
      return (
        <>
          <rect x="6" y="12" width="148" height="76" {...main} />
          <path d="M80 12V88" {...main} />
          <circle cx="80" cy="50" r="9.5" {...minor} />
          <path d="M6 37.6h30.7v24.8H6M154 37.6h-30.7v24.8H154" {...minor} />
          <path d="M36.7 40.5A9.5 9.5 0 0 1 36.7 59.5M123.3 40.5A9.5 9.5 0 0 0 123.3 59.5" {...minor} />
          <path d="M6 16.6H22A34 34 0 0 1 22 83.4H6M154 16.6H138A34 34 0 0 0 138 83.4H154" {...main} />
          <circle cx="14.3" cy="50" r="1.8" {...minor} />
          <circle cx="145.7" cy="50" r="1.8" {...minor} />
        </>
      );
    case "futsal":
      return (
        <>
          <rect x="6" y="14" width="148" height="72" {...main} />
          <path d="M80 14V86" {...main} />
          <circle cx="80" cy="50" r="11" {...minor} />
          <path d="M6 26A22 22 0 0 1 28 48V52A22 22 0 0 1 6 74M154 26A22 22 0 0 0 132 48V52A22 22 0 0 0 154 74" {...main} />
          <path d="M6 47H2v6h4M154 47h4v6h-4" {...minor} />
          <circle cx="43" cy="50" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="117" cy="50" r="1.3" fill="currentColor" stroke="none" />
        </>
      );
    case "hockey":
      return (
        <>
          <rect x="6" y="6" width="148" height="88" {...main} />
          <path d="M80 6V94" {...main} />
          <path d="M43.2 6V94M116.8 6V94" {...minor} />
          <path
            d="M6 20.4A23.7 23.7 0 0 1 29.7 44.1V55.9A23.7 23.7 0 0 1 6 79.6M154 20.4A23.7 23.7 0 0 0 130.3 44.1V55.9A23.7 23.7 0 0 0 154 79.6"
            {...main}
          />
          <path d="M6 47H2v6h4M154 47h4v6h-4" {...minor} />
        </>
      );
    case "touch":
      return (
        <>
          <rect x="6" y="10" width="148" height="80" {...main} />
          <path d="M16 10V90M144 10V90M80 10V90" {...main} />
          <path d="M61.7 10V90M98.3 10V90" {...dashed} />
          <path d="M16 36.7H144M16 63.3H144" {...dashed} />
        </>
      );
    case "oztag":
      return (
        <>
          <rect x="6" y="10" width="148" height="80" {...main} />
          <path d="M16 10V90M144 10V90M80 10V90" {...main} />
          <path d="M34.3 10V90M125.7 10V90" {...dashed} />
          <path d="M76 50H84" {...minor} />
        </>
      );
  }
}
