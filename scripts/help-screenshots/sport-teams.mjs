// The per-sport help teams: one demo team per sport, owned by the
// sports help coach (lib.mjs SPORTS_COACH). seed.mjs makes them and
// their game; sports.mjs plays each game through the live screen and
// shoots it into public/help-screenshots/<slug>/. Names are made up.
//
// Ages are ones that keep score, so the scoring shots have buttons.
// Touch and Oztag are mixed teams (girl and boy, alternating).

export const SPORT_TEAMS = [
  {
    slug: "netball", sport: "netball", age: "11u", team: "Northcote Kestrels", opponent: "Thornbury Thunder",
    venue: "Darebin Netball Courts", bench: 3,
    squad: ["Ava Kowalski", "Bella Tran", "Chloe Murphy", "Daisy Okafor", "Ella Fitzgerald", "Freya Singh",
      "Georgia Walsh", "Harper Lee", "Isla Brennan", "Jasmine Haddad"],
  },
  {
    slug: "afl", sport: "afl", age: "U11", team: "Essendon Swans", opponent: "Moonee Ponds Lions",
    venue: "Windy Hill", bench: 3,
    squad: ["Archie Doyle", "Billy Nguyen", "Charlie Russo", "Darcy Kelly", "Eddie Walsh", "Frankie Chen",
      "Georgie Silva", "Harry Brennan", "Indi Murray", "Jack Petrakis", "Lily Johnson", "Max Okafor",
      "Nate Fraser", "Olive Hughes", "Pip Anderson"],
  },
  {
    slug: "rugby-league", sport: "rugby_league", age: "U9", team: "Penrith Panthers Cubs", opponent: "St Marys Saints",
    venue: "Hickeys Lane Oval", bench: 3,
    squad: ["Ari Tuilagi", "Beau Fraser", "Cody Ngata", "Dane Moore", "Eli Kaufusi", "Flynn Gallagher",
      "Gus Taufa", "Hugh Lin", "Isaac Barnes", "Jai Fonua", "Kobe Wright"],
  },
  {
    slug: "soccer", sport: "soccer", age: "U12", team: "Marrickville Red Devils", opponent: "Leichhardt Lions",
    venue: "Henson Park", bench: 3,
    squad: ["Alessia Romano", "Ben Carter", "Carlos Mendes", "Dylan Price", "Elena Petrova", "Finn O'Connor",
      "Gabe Santos", "Hana Ito", "Iker Lopez", "Jonah Kim", "Kai Moretti", "Layla Hassan"],
  },
  {
    slug: "basketball", sport: "basketball", age: "U12", team: "Nunawading Spectres", opponent: "Ringwood Hawks",
    venue: "Nunawading Basketball Centre", bench: 3,
    squad: ["Aiden Park", "Bodhi Walsh", "Caleb Nguyen", "Deng Malual", "Ethan Rossi", "Felix Hart",
      "Gabriel Achieng", "Hamish Reid"],
  },
  {
    slug: "rugby-union", sport: "rugby_union", age: "U9", team: "Eastwood Colts", opponent: "Gordon Highlanders",
    venue: "TG Millner Field", bench: 3,
    squad: ["Angus McLeod", "Brodie Tupou", "Callum Hayes", "Dom Faleolo", "Elliot Grant", "Fraser Lomu",
      "George Pritchard", "Henry Vaka", "Isaac Mortimer", "Jamie Sopoaga", "Kit Delaney", "Liam Ross",
      "Monty Sharpe"],
  },
  {
    slug: "touch-football", sport: "touch", age: "U11", team: "Cronulla Sharks Touch", opponent: "Sutherland Saints",
    venue: "Captain Cook Oval", bench: 3,
    mixed: { mixed_max_boys: 3, mixed_min_girls: 1, mixed_min_boys: 1 },
    squad: ["Amelia Ross", "Blake Turner", "Charlotte Ng", "Declan Hart", "Evie Morgan", "Flynn Cooper",
      "Grace Lim", "Hunter Bell", "Ivy Chandler"],
  },
  {
    slug: "oztag", sport: "oztag", age: "U10", team: "Blacktown Bandits", opponent: "Rooty Hill Rams",
    venue: "Francis Park", bench: 3,
    mixed: { mixed_max_boys: 4, mixed_min_girls: 1, mixed_min_boys: 0 },
    squad: ["Aaliyah Fonoti", "Bailey Watts", "Cleo Haddad", "Dante Ruiz", "Emmie Clarke", "Felix Nakamura",
      "Gemma Price", "Harvey Doyle", "Imogen Shaw", "Jordan Tafa", "Kiara Ellis"],
  },
  {
    slug: "hockey", sport: "hockey", age: "U11", team: "Camberwell Comets", opponent: "Box Hill Bats",
    venue: "Ashburton Park", bench: 3,
    squad: ["Annabel Fox", "Ben Whitfield", "Clara Dimitriou", "Dev Patel", "Emily Sutton", "Fergus Kane",
      "Gracie Lowe", "Henry Abbott", "Ines Moreau", "Jake Ramsay", "Keira O'Neill"],
  },
  {
    slug: "futsal", sport: "futsal", age: "U12", team: "Footscray Flames", opponent: "Sunshine Strikers",
    venue: "Footscray Futsal Centre", bench: 3,
    squad: ["Adriano Costa", "Bianca Russo", "Cristian Pop", "Dina Nasser", "Enzo Ferri", "Fatima Ali",
      "Gio Bianchi", "Hugo Lam"],
  },
];
