import type { Locale, TopicCandidate } from "./types";

export type SoundCue = {
  query: string;
  labels: Record<Locale, string>;
  terms: string[];
  connection: "direct" | "evocative";
  exclude?: string[];
};

const cue = (query: string, es: string, terms: string[] = [query], connection: SoundCue["connection"] = "direct", exclude?: string[]): SoundCue =>
  ({ query, labels: { en: query, es }, terms, connection, exclude });
const evokes = (query: string, es: string, terms: string[] = [query]) => cue(query, es, terms, "evocative");

// Editorial listening associations, not Unicode definitions or claims that a
// silent object makes a sound. Keep queries short: Freesound ANDs their words.
// Terms describe audible evidence we must find in the returned metadata.
const laughter = [cue("human laughter", "risa humana", ["laughter", "laughing", "laugh", "chuckle", "chuckling", "giggle", "giggling"], "direct", ["evil", "ghost", "creepy", "demonic", "sinister", "taunting", "mocking"])];
const crying = [cue("human crying", "llanto humano", ["crying", "sobbing", "weeping", "sob"]), evokes("sad piano", "piano melancólico", ["sad piano", "melancholic piano", "melancholy piano"])];
const sleep = [cue("snoring", "ronquidos", ["snoring", "snore"]), cue("sleep breathing", "respiración al dormir", ["sleep breathing", "sleeping breathing", "gentle breathing", "deep breathing"]), evokes("night crickets", "grillos nocturnos", ["night crickets", "crickets", "night insects"])];
const love = [evokes("kiss", "beso", ["kiss", "kissing", "kisses"]), evokes("romantic piano", "piano romántico", ["romantic piano", "romantic melody", "love piano"])];
const thought = [evokes("clock ticking", "tic-tac de reloj", ["clock ticking", "ticking clock", "tick tock"]), evokes("soft piano", "piano suave", ["soft piano", "gentle piano", "reflective piano"])];
const calm = [evokes("gentle stream", "arroyo tranquilo", ["gentle stream", "flowing stream", "babbling brook", "stream flowing"]), evokes("meditation bell", "campana de meditación", ["meditation bell", "singing bowl", "tibetan bowl"])];
const space = [evokes("space ambience", "ambiente espacial imaginado", ["space ambience", "space ambiance", "space drone", "cosmic drone", "spaceship ambience"]), evokes("sci fi drone", "zumbido de ciencia ficción", ["sci fi drone", "scifi drone", "science fiction drone"])];
const ocean = [cue("ocean waves", "olas del mar", ["ocean waves", "sea waves", "waves breaking", "beach waves", "ocean surf", "surf", "seashore"], "direct", ["sine wave", "square wave", "sawtooth", "wavetable"]), cue("underwater ambience", "ambiente submarino", ["underwater", "hydrophone", "under water"], "direct", ["synth", "synthesizer"])];
const paper = [cue("paper rustling", "papel al moverse", ["paper rustling", "paper rustle", "paper crumpling", "paper folding"]), cue("page turning", "pasar las páginas", ["page turning", "turning pages", "page turn", "pages flipping"])];
const fire = [cue("fire crackling", "crepitar del fuego", ["fire crackling", "crackling fire", "campfire", "bonfire", "fireplace"])];
const bells = [evokes("church bells", "campanas de iglesia", ["church bells", "church bell", "chapel bell"]), evokes("choir", "coro", ["choir", "choral"])];
const footsteps = [cue("footsteps", "pasos", ["footsteps", "footstep", "walking steps"])];

const profiles: [string[], SoundCue[]][] = [
  [["laughter", "laughing", "face with tears of joy", "rolling on the floor laughing"], laughter],
  [["smile", "smiling face", "joy", "happiness", "grinning face"], laughter.map(c => ({ ...c, connection: "evocative" as const }))],
  [["sadness", "heartbreak", "crying face", "loudly crying face"], crying],
  [["love", "heart symbol", "hug", "hugging", "hugging face", "love letter"], love],
  [["heart", "human heart", "heartbeat", "anatomical heart"], [cue("heartbeat", "latido del corazón", ["heartbeat", "heart beat", "heart beating"])]],
  [["thought", "brain", "human brain", "thinking face", "nerd", "nerd face"], thought],
  [["emotion"], [evokes("emotional piano", "piano emotivo", ["emotional piano", "emotive piano", "emotional melody"])]],
  [["sleep", "sleeping", "sleeping face", "yawning face"], sleep],
  [["anger", "angry face", "rage"], [cue("angry growl", "gruñido de enojo", ["angry growl", "angry grunt", "frustrated grunt"]), evokes("dramatic impact", "golpe dramático", ["dramatic impact", "cinematic impact"])]],
  [["fear", "anxiety", "face screaming in fear"], [cue("gasp", "jadeo de susto", ["gasp", "gasping"]), evokes("suspense drone", "zumbido de suspenso", ["suspense drone", "tension drone", "horror drone"])]],
  [["surprise", "astonished face", "face with open mouth", "awe"], [cue("gasp", "jadeo de sorpresa", ["gasp", "gasping"]), evokes("surprise sting", "acento musical de sorpresa", ["surprise sting", "surprise sound", "surprised sound"])]],
  [["relief", "peace", "meditation", "person in lotus position"], calm],
  [["silence", "shushing face", "facial expression"], [evokes("quiet room tone", "ambiente de una habitación tranquila", ["quiet room", "room tone", "silent room"])]],
  [["embarrassment", "lie"], [evokes("nervous laughter", "risa nerviosa", ["nervous laughter", "nervous laugh", "awkward laugh"])]],
  [["eye rolling", "boredom", "smirk"], [evokes("human sigh", "suspiro humano", ["sigh", "sighing"])]],
  [["wink"], [evokes("cartoon wink", "guiño de caricatura", ["cartoon wink", "wink sound", "winking"])]],
  [["nausea"], [cue("human gagging", "arcadas", ["gagging", "retching", "gag"])]],
  [["illness", "face with thermometer", "face with medical mask"], [cue("cough", "tos", ["cough", "coughing"])]],
  [["sneeze", "sneezing face"], [cue("sneeze", "estornudo", ["sneeze", "sneezing"])]],
  [["drooling"], [evokes("mouth watering", "sonidos de la boca", ["mouth watering", "lip smacking"])]],
  [["celebration", "partying face", "party popper", "confetti ball"], [cue("crowd cheering", "aplausos y vítores", ["crowd cheering", "cheering", "cheers"]), cue("party horn", "corneta de fiesta", ["party horn", "party blower"]), cue("champagne cork", "descorchar champán", ["champagne cork", "cork pop"])]],
  [["applause", "clapping hands"], [cue("applause", "aplausos", ["applause", "clapping", "hand clap"])]],
  [["waving", "waving hand"], [evokes("hello greeting", "saludo de bienvenida", ["hello", "greeting"])]],
  [["angel", "prayer"], bells],
  [["play", "playful"], [evokes("cartoon boing", "rebote de caricatura", ["boing", "cartoon bounce"])]],
  [["sunglasses"], [cue("glasses folding", "plegar unas gafas", ["glasses folding", "glasses handling", "sunglasses"])]],
  [["cold", "cold face"], [evokes("winter wind", "viento invernal", ["winter wind", "cold wind", "blizzard"])]],
  [["heat", "hot face"], [evokes("desert wind", "viento del desierto", ["desert wind", "hot wind"])]],
  [["melting"], [cue("ice melting", "hielo derritiéndose", ["ice melting", "melting ice"])]],
  [["magic", "sparkles", "infinity"], [evokes("magic chimes", "campanillas mágicas", ["magic chime", "magic chimes", "magical chime", "magical chimes", "magic sparkle", "fairy dust", "twinkle"]), evokes("shimmer", "destellos sonoros", ["shimmer", "shimmering"])]],
  [["ocean", "wave", "water wave", "sea", "beach", "beach with umbrella"], ocean],
  [["octopus", "octopoda", "jellyfish", "fish", "tropical fish", "coral"], [evokes("underwater ambience", "ambiente submarino", ocean[1].terms)]],
  [["crescent", "moon", "crescent moon", "night", "night with stars", "milky way"], [evokes("night crickets", "grillos nocturnos", ["crickets", "night insects"]), ...space.slice(0, 1)]],
  [["planetary ring", "ringed planet", "planet", "saturn", "space", "outer space", "telescope", "astronomy"], space],
  [["earth", "globe showing americas", "globe showing europe africa", "globe showing asia australia"], [evokes("forest ambience", "ambiente de bosque", ["forest ambience", "forest ambiance", "forest birds"]), ...ocean.slice(0, 1)]],
  [["fire", "flame"], fire],
  [["volcano"], [cue("volcano eruption", "erupción volcánica", ["volcano", "volcanic", "eruption"]), evokes("deep rumble", "retumbo profundo", ["deep rumble", "low rumble"])]],
  [["waterfall"], [cue("waterfall", "cascada", ["waterfall", "waterfalls"])]],
  [["rain", "cloud with rain", "umbrella with rain drops"], [cue("rain", "lluvia", ["rain", "rainfall", "raining"])]],
  [["thunderstorm", "cloud with lightning", "cloud with lightning and rain"], [cue("thunder", "trueno", ["thunder", "thunderstorm"]), cue("heavy rain", "lluvia intensa", ["heavy rain", "downpour"])]],
  [["wind", "wind face", "tornado"], [cue("wind blowing", "soplar del viento", ["wind blowing", "blowing wind", "wind gust", "howling wind"])]],
  [["snow", "snowflake", "snowman"], [cue("snow footsteps", "pasos en la nieve", ["snow footsteps", "footsteps snow", "walking snow", "snow crunch"])]],
  [["rainbow", "sun", "sun with face", "sunrise", "sunrise over mountains"], [evokes("morning birds", "aves al amanecer", ["morning birds", "dawn chorus", "birdsong"])]],
  [["desert island", "island", "palm tree"], [evokes("tropical birds", "aves tropicales", ["tropical birds", "tropical forest", "jungle ambience"]), ...ocean.slice(0, 1).map(c => ({ ...c, connection: "evocative" as const }))]],
  [["cherry blossom", "cherry blossoms", "flower", "rose", "sunflower", "blossom", "butterfly", "mushroom", "seedling", "herb"], [evokes("garden birds", "aves en un jardín", ["garden birds", "birdsong", "birds singing"]), evokes("leaves rustling", "susurro de las hojas", ["leaves rustling", "rustling leaves", "leaf rustle"])]],
  [["dog", "dog face"], [cue("dog barking", "ladridos de perro", ["dog bark", "dog barking", "barking", "barks"]), cue("dog panting", "jadeo de perro", ["dog panting", "dog whine", "dog whining"])]],
  [["cat", "cat face"], [cue("cat meow", "maullido de gato", ["meow", "meowing", "miaow"]), cue("cat purring", "ronroneo de gato", ["cat purring", "purr", "purring"])]],
  [["whale", "spouting whale"], [cue("whale song", "canto de ballena", ["whale song", "whale call", "whale vocalization", "whale vocalisation", "whale singing", "whales singing", "humpback", "whale hydrophone"])]],
  [["monkey", "monkey face", "gorilla", "orangutan"], [cue("monkey calls", "vocalizaciones de monos", ["monkey", "monkeys", "chimpanzee", "chimp"])]],
  [["tiger", "tiger face"], [cue("tiger growl", "gruñido de tigre", ["tiger growl", "tiger roar", "tiger roaring"])]],
  [["lion", "lion face"], [cue("lion roar", "rugido de león", ["lion roar", "lion roaring", "lions roaring"])]],
  [["cattle", "cow", "cow face", "ox", "water buffalo", "bos taurus"], [cue("cow moo", "mugido de vaca", ["moo", "mooing", "cow moo", "cattle"])]],
  [["pig", "pig face"], [cue("pig oink", "gruñido de cerdo", ["pig", "pigs", "oink", "oinking"])]],
  [["mouse", "mouse face", "hamster", "rat"], [cue("mouse squeak", "chillido de ratón", ["mouse squeak", "mice squeaking", "rodent squeak"], "direct", ["computer", "mouse click", "keyboard"])]],
  [["rabbit", "rabbit face", "bear", "bear face", "giant panda", "panda", "teddy bear"], [evokes("forest ambience", "ambiente de bosque", ["forest ambience", "forest ambiance", "woodland ambience"])]],
  [["fox", "fox face"], [cue("fox call", "vocalización de zorro", ["fox call", "fox bark", "fox scream", "fox screaming"], "direct", ["fox news", "fox river"])]],
  [["frog", "frog face"], [cue("frog croaking", "croar de ranas", ["frog", "frogs", "croak", "croaking"])]],
  [["horse", "horse face", "unicorn"], [cue("horse neigh", "relincho de caballo", ["neigh", "neighing", "whinny"]), cue("horse hooves", "cascos de caballo", ["horse hooves", "hoofbeats", "horse gallop"])]],
  [["wolf", "wolf face"], [cue("wolf howl", "aullido de lobo", ["wolf howl", "wolf howling", "wolves howling"])]],
  [["bird", "sparrow", "dove"], [cue("birdsong", "canto de aves", ["birdsong", "birds singing", "bird chirp"])]],
  [["rooster", "chicken"], [cue("rooster crow", "canto del gallo", ["rooster", "crowing", "cock crow"]), cue("chicken clucking", "cacareo de gallina", ["clucking", "chickens"])]],
  [["duck"], [cue("duck quack", "graznido de pato", ["quack", "quacking", "ducks"])]],
  [["owl"], [cue("owl hoot", "ulular de búho", ["owl", "owls", "hooting"])]],
  [["bee", "honeybee", "fly", "mosquito"], [cue("insect buzzing", "zumbido de insectos", ["bee buzzing", "bees buzzing", "insect buzzing", "mosquito"])]],
  [["snake"], [cue("snake hiss", "siseo de serpiente", ["snake hiss", "snake hissing"])]],
  [["coffee", "hot beverage"], [cue("espresso machine", "máquina de espresso", ["espresso", "coffee machine", "coffee maker"]), cue("coffee pouring", "servir café", ["coffee pouring", "pouring coffee"]), evokes("cafe ambience", "ambiente de cafetería", ["cafe ambience", "cafe ambiance", "coffee shop", "cafeteria"])]],
  [["bubble tea", "tea", "teacup without handle", "cup with straw", "beverage box"], [cue("drink sipping", "sorber una bebida", ["sipping", "sip", "slurping", "drinking straw"]), cue("tea pouring", "servir té", ["tea pouring", "pouring tea", "kettle"])]],
  [["strawberry", "lemon", "avocado", "cherries", "apple", "red apple", "green apple", "pear", "peach", "banana", "watermelon", "grapes", "tomato", "carrot", "cucumber"], [evokes("fruit chopping", "cortar fruta", ["fruit chopping", "chopping fruit", "vegetable chopping", "cutting vegetables"]), evokes("crunch bite", "mordisco crujiente", ["crunch bite", "crunchy bite", "apple bite", "biting apple"])]],
  [["cake", "birthday cake", "shortcake", "cupcake", "cookie", "bread", "cooking", "frying pan", "meat on bone", "cut of meat", "bacon"], [evokes("kitchen cooking", "cocinar en la cocina", ["cooking", "kitchen", "baking", "frying", "sizzling"])]],
  [["musical note", "musical notes", "music", "musical score"], [cue("piano melody", "melodía de piano", ["piano melody", "piano phrase", "piano notes"]), cue("guitar melody", "melodía de guitarra", ["guitar melody", "guitar phrase", "guitar notes"]), cue("music box", "caja de música", ["music box", "musicbox"])]],
  [["musical keyboard", "piano", "keyboard instrument"], [cue("piano notes", "notas de piano", ["piano", "grand piano", "upright piano"], "direct", ["computer keyboard", "typing"])]],
  [["guitar"], [cue("guitar strum", "rasgueo de guitarra", ["guitar", "strum", "strumming"])]],
  [["violin"], [cue("violin", "violín", ["violin", "fiddle"])]],
  [["trumpet"], [cue("trumpet", "trompeta", ["trumpet"])]],
  [["saxophone"], [cue("saxophone", "saxofón", ["saxophone", "sax"])]],
  [["drum", "drum with drumsticks"], [cue("drum beat", "ritmo de tambor", ["drum", "drums", "drumming"])]],
  [["dance", "woman dancing", "man dancing"], [cue("dance rhythm", "ritmo de baile", ["dance rhythm", "dance beat", "dance loop"])]],
  [["performing arts", "circus", "theater", "theatre"], [cue("audience applause", "aplausos del público", ["audience applause", "applause", "crowd clapping"]), evokes("theater ambience", "ambiente de teatro", ["theater ambience", "theatre ambience", "backstage"])]],
  [["running", "person running"], [cue("running footsteps", "pasos al correr", ["running footsteps", "footsteps running", "running steps", "jogging"])]],
  [["walking", "person walking"], footsteps],
  [["swimming", "person swimming"], [cue("swimming splashes", "chapoteo al nadar", ["swimming", "pool splash", "swim"])]],
  [["cycling", "bicycle", "person biking"], [cue("bicycle riding", "rodar en bicicleta", ["bicycle", "bike wheel", "bike chain", "cycling"]), cue("bicycle bell", "timbre de bicicleta", ["bicycle bell", "bike bell"])]],
  [["muscle", "flexed biceps", "gymnastics", "person cartwheeling"], [evokes("gym workout", "entrenamiento en gimnasio", ["gym workout", "gym weights", "weight lifting", "weightlifting"])]],
  [["association football", "soccer ball", "football", "soccer"], [cue("soccer kick", "patada a un balón", ["soccer kick", "football kick", "ball kick", "kicking ball"]), cue("stadium crowd", "público en un estadio", ["stadium crowd", "football crowd", "soccer crowd"])]],
  [["basketball"], [cue("basketball bounce", "rebote de balón de baloncesto", ["basketball", "basket ball"])]],
  [["tennis", "tennis ball"], [cue("tennis ball", "golpe de pelota de tenis", ["tennis"])]],
  [["painting", "artist palette", "art"], [cue("paint brush", "pincel al pintar", ["paint brush", "paintbrush", "painting brush", "brush strokes"]), cue("pencil drawing", "dibujar con lápiz", ["pencil drawing", "drawing pencil", "pencil sketch", "pencil scratching"])]],
  [["book", "books", "open book", "notebook"], [paper[1], cue("book pages", "páginas de un libro", ["book pages", "book rustling", "book handling", "paging book"]) ]],
  [["newspaper", "scroll", "paper"], paper],
  [["incandescent light bulb", "light bulb", "electric light"], [cue("light switch", "interruptor de luz", ["light switch", "switch click", "switching light"]), evokes("idea chime", "campanilla de una idea", ["idea chime", "idea sound", "notification chime"])]],
  [["candle"], [cue("match strike", "encender una cerilla", ["match strike", "striking match", "matchstick"]), evokes("small flame", "llama pequeña", ["small flame", "candle flame"])]],
  [["compass"], [evokes("hiking footsteps", "pasos de senderismo", ["hiking footsteps", "hiking", "walking gravel"])]],
  [["tokyo tower", "statue of liberty", "classical architecture", "cityscape"], [evokes("city ambience", "ambiente urbano", ["city ambience", "city ambiance", "city traffic", "urban ambience"])]],
  [["rocket"], [cue("rocket launch", "lanzamiento de cohete", ["rocket launch", "rocket engine", "rocket ignition"])]],
  [["airplane", "aeroplane", "airplane departure"], [cue("airplane engine", "motor de avión", ["airplane", "aeroplane", "aircraft", "jet engine"])]],
  [["car", "automobile", "oncoming automobile", "racing car"], [cue("car engine", "motor de automóvil", ["car engine", "engine rev", "car passing"]), cue("car horn", "bocina de automóvil", ["car horn", "honking"])]],
  [["train", "locomotive", "railway car", "high speed train"], [cue("train passing", "paso de un tren", ["train passing", "train pass", "locomotive", "railway"])]],
  [["ship", "sailboat", "speedboat", "ferry"], [cue("boat engine", "motor de barco", ["boat engine", "ship engine", "boat passing"]), cue("ship horn", "bocina de barco", ["ship horn", "boat horn", "foghorn"])]],
  [["telephone", "telephone receiver", "mobile phone"], [cue("phone ringing", "teléfono sonando", ["phone ringing", "telephone ring", "ringtone"])]],
  [["camera", "camera with flash"], [cue("camera shutter", "obturador de cámara", ["camera shutter", "shutter click"])]],
  [["computer", "laptop", "desktop computer", "keyboard"], [cue("keyboard typing", "escribir en un teclado", ["typing", "keyboard typing", "computer keyboard"])]],
  [["computer mouse", "mouse computing"], [cue("mouse click", "clic de ratón", ["mouse click", "mouse clicking", "computer mouse"])]],
  [["bell"], [cue("bell ringing", "campana sonando", ["bell", "bells"])]],
  [["alarm clock", "clock", "watch", "hourglass", "hourglass not done"], [cue("clock ticking", "tic-tac de reloj", ["clock ticking", "ticking clock", "tick tock"]), cue("alarm clock", "alarma de reloj", ["alarm clock", "clock alarm"])]],
  [["key", "old key", "locked", "unlocked"], [cue("keys jingling", "tintineo de llaves", ["keys jingling", "key jingle", "keys rattling"]), cue("lock opening", "abrir una cerradura", ["lock opening", "unlocking", "door lock"])]],
  [["hammer", "hammer and pick", "hammer and wrench"], [cue("hammer hitting", "golpes de martillo", ["hammer", "hammering"])]],
  [["scissors"], [cue("scissors cutting", "cortar con tijeras", ["scissors", "scissor"])]],
  [["money", "money bag", "coin"], [cue("coins jingling", "tintineo de monedas", ["coins", "coin", "cash register"])]],
  [["fireworks", "sparkler"], [cue("fireworks", "fuegos artificiales", ["fireworks", "firework", "firecracker"])]],
];

export const normalizeSoundText = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const bySubject = new Map(profiles.flatMap(([subjects, cues]) => subjects.map(subject => [normalizeSoundText(subject), cues] as const)));

export function soundSearchPlan(topic: TopicCandidate): { subject: string; cues: SoundCue[] } {
  // Remove editorial qualifiers, but retain disambiguation such as "computing"
  // or "fish" so a changed subject cannot silently become a homonym.
  const subject = normalizeSoundText(topic.englishQuery.replace(/\s*\((?:emotion|activity|supernatural|symbol|lighting|instrument)\)/gi, ""));
  // Do not use the emoji's old interpretation after a user changes the subject.
  // Unknown subjects get a precise query, never an unrelated category fallback.
  const flag = /^flag of /u.test(subject) ? [cue("flag flapping", "bandera ondeando", ["flag flapping", "flag flutter", "flapping flag", "flag waving"], "evocative", ["wing", "bird"])] : undefined;
  const cues = bySubject.get(subject) || flag || [cue(subject, topic.language === "es" ? topic.label : subject)];
  return { subject, cues: cues.slice(0, 3) };
}
