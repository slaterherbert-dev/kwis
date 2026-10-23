// ═══════════════════════════════════════════════════════════════
// CLASS BUILDERS — built-in prompts (English + Spanish).
// To add a prompt, add a line. Teachers can also add their own lists
// in the app (saved on their computer).
// ═══════════════════════════════════════════════════════════════

// Would You Rather: { a, b } — each side { en, es }
export const WOULD_YOU_RATHER = [
  ['Be able to fly', 'Volar', 'Be invisible', 'Ser invisible'],
  ['Live in ancient Rome', 'Vivir en la antigua Roma', 'Live in medieval Japan', 'Vivir en el Japón medieval'],
  ['Explore the deep ocean', 'Explorar el fondo del océano', 'Explore outer space', 'Explorar el espacio exterior'],
  ['Have a pet dragon', 'Tener un dragón como mascota', 'Have a pet dinosaur', 'Tener un dinosaurio como mascota'],
  ['Travel 100 years into the past', 'Viajar 100 años al pasado', 'Travel 100 years into the future', 'Viajar 100 años al futuro'],
  ['Eat only pizza for a year', 'Comer solo pizza por un año', 'Never eat pizza again', 'Nunca volver a comer pizza'],
  ['Be the best player on a losing team', 'Ser el mejor jugador de un equipo perdedor', 'Be the worst player on a winning team', 'Ser el peor jugador de un equipo ganador'],
  ['Talk to animals', 'Hablar con los animales', 'Speak every human language', 'Hablar todos los idiomas del mundo'],
  ['Live in the mountains', 'Vivir en las montañas', 'Live at the beach', 'Vivir en la playa'],
  ['Have summer all year', 'Tener verano todo el año', 'Have winter all year', 'Tener invierno todo el año'],
  ['Be a famous athlete', 'Ser un atleta famoso', 'Be a famous musician', 'Ser un músico famoso'],
  ['Never have homework', 'Nunca tener tarea', 'Never have tests', 'Nunca tener exámenes'],
  ['Sail with a Viking crew', 'Navegar con una tripulación vikinga', 'Ride with a Silk Road caravan', 'Viajar en una caravana de la Ruta de la Seda'],
  ['Build a pyramid', 'Construir una pirámide', 'Build a castle', 'Construir un castillo'],
  ['Be a judge', 'Ser juez', 'Be a senator', 'Ser senador'],
  ['Have a job you love that pays okay', 'Tener un trabajo que te encanta con un sueldo normal', 'Have a job you don’t love that pays a lot', 'Tener un trabajo que no te gusta con un sueldo muy alto'],
  ['Read minds', 'Leer mentes', 'See the future', 'Ver el futuro'],
  ['Have a robot that does your chores', 'Tener un robot que haga tus quehaceres', 'Have a robot that does your homework', 'Tener un robot que haga tu tarea'],
  ['Always be 10 minutes early', 'Llegar siempre 10 minutos temprano', 'Always be 10 minutes late', 'Llegar siempre 10 minutos tarde'],
  ['Live without music', 'Vivir sin música', 'Live without movies', 'Vivir sin películas'],
  ['Be the funniest person in the room', 'Ser la persona más graciosa del salón', 'Be the smartest person in the room', 'Ser la persona más inteligente del salón'],
  ['Visit every country on Earth', 'Visitar todos los países del mundo', 'Visit every planet in the solar system', 'Visitar todos los planetas del sistema solar'],
  ['Live in a city with no cars', 'Vivir en una ciudad sin carros', 'Live in a city with no phones', 'Vivir en una ciudad sin teléfonos'],
  ['Be a news reporter', 'Ser reportero de noticias', 'Be a detective', 'Ser detective'],
  ['Have a rewind button for your life', 'Tener un botón para retroceder tu vida', 'Have a pause button for your life', 'Tener un botón para pausar tu vida'],
  ['Write one new law everyone must follow', 'Escribir una ley nueva que todos deban seguir', 'Cancel one law', 'Eliminar una ley'],
  ['Eat only sweet food', 'Comer solo comida dulce', 'Eat only salty food', 'Comer solo comida salada'],
  ['Have a giant house', 'Tener una casa gigante', 'Have a tiny house anywhere in the world', 'Tener una casa pequeña en cualquier lugar del mundo'],
  ['Act in a play', 'Actuar en una obra de teatro', 'Give a speech', 'Dar un discurso'],
  ['Explore a jungle', 'Explorar una selva', 'Explore a desert', 'Explorar un desierto'],
  ['Eat breakfast food at every meal', 'Comer desayuno en todas las comidas', 'Eat dinner food at every meal', 'Comer cena en todas las comidas'],
  ['Meet a famous inventor from history', 'Conocer a un inventor famoso de la historia', 'Meet a famous leader from history', 'Conocer a un líder famoso de la historia'],
].map(([aEn, aEs, bEn, bEs]) => ({ a: { en: aEn, es: aEs }, b: { en: bEn, es: bEs } }))

// Stand Up If… — chosen to be safe and inclusive (nothing about family,
// money, religion, appearance, or where someone was born).
export const STAND_UP_IF = [
  ['you have a pet', 'tienes una mascota'],
  ['you’ve been to the mountains', 'has ido a las montañas'],
  ['you like pineapple on pizza', 'te gusta la piña en la pizza'],
  ['you speak more than one language', 'hablas más de un idioma'],
  ['you play a sport', 'practicas un deporte'],
  ['you play a musical instrument', 'tocas un instrumento musical'],
  ['you’ve ever seen snow', 'alguna vez has visto la nieve'],
  ['you like to draw', 'te gusta dibujar'],
  ['you’d rather read the book than watch the movie', 'prefieres leer el libro que ver la película'],
  ['you’ve ever cooked a meal for someone', 'alguna vez has cocinado algo para alguien'],
  ['you stayed up too late last night', 'te desvelaste anoche'],
  ['you like scary movies', 'te gustan las películas de terror'],
  ['you have a hidden talent', 'tienes un talento escondido'],
  ['you’ve ever built something with your hands', 'alguna vez has construido algo con tus manos'],
  ['you like spicy food', 'te gusta la comida picante'],
  ['you like getting up early', 'te gusta levantarte temprano'],
  ['you play video games', 'juegas videojuegos'],
  ['you’ve ever had a song stuck in your head all day', 'alguna vez has tenido una canción pegada en la cabeza todo el día'],
  ['you’ve read a book you couldn’t put down', 'has leído un libro que no podías dejar de leer'],
  ['you like history', 'te gusta la historia'],
  ['you want to visit another continent someday', 'quieres visitar otro continente algún día'],
  ['you’ve ever laughed so hard you cried', 'alguna vez te has reído tanto que lloraste'],
  ['you’d like to start your own business someday', 'te gustaría tener tu propio negocio algún día'],
  ['you like being outdoors', 'te gusta estar al aire libre'],
  ['you’ve ever helped a stranger', 'alguna vez has ayudado a un desconocido'],
  ['you’re a little nervous about something this week', 'estás un poco nervioso por algo esta semana'],
  ['you’d rather work in a group than alone', 'prefieres trabajar en grupo que solo'],
  ['you’ve ever learned something from a video online', 'alguna vez has aprendido algo con un video en internet'],
  ['you like to sing, even if only in the shower', 'te gusta cantar, aunque sea solo en la ducha'],
  ['you’ve ever changed your mind after hearing someone’s argument', 'alguna vez cambiaste de opinión después de escuchar los argumentos de alguien'],
  ['you think you’d be a good teacher', 'crees que serías un buen maestro'],
  ['you have a favorite sports team', 'tienes un equipo deportivo favorito'],
].map(([en, es]) => ({ en, es }))

// Letter Rush categories
export const CATEGORIES = {
  general: [
    ['An animal', 'Un animal'], ['A food', 'Una comida'], ['Something in a classroom', 'Algo en un salón de clases'],
    ['A famous person', 'Una persona famosa'], ['A city', 'Una ciudad'], ['A sport or game', 'Un deporte o juego'],
    ['Something you wear', 'Una prenda de ropa'], ['A movie or TV show', 'Una película o serie'], ['A job', 'Un trabajo'],
    ['Something cold', 'Algo frío'], ['A word that describes a person', 'Una palabra que describe a una persona'],
    ['Something in a kitchen', 'Algo en una cocina'], ['A vehicle', 'Un vehículo'], ['A country', 'Un país'],
    ['A brand', 'Una marca'], ['A body part', 'Una parte del cuerpo'], ['Something with wheels', 'Algo con ruedas'],
    ['A musical instrument', 'Un instrumento musical'], ['A plant or flower', 'Una planta o flor'],
    ['Something at the beach', 'Algo que encontrarías en la playa'], ['A school subject', 'Una materia escolar'],
    ['A hobby', 'Un pasatiempo'], ['A dessert', 'Un postre'], ['A color', 'Un color'],
    ['Something that makes noise', 'Algo que hace ruido'], ['A cartoon character', 'Un personaje de caricaturas'],
    ['A drink', 'Una bebida'], ['Something you’d pack for a trip', 'Algo que llevarías de viaje'],
    ['A holiday or celebration', 'Una fiesta o celebración'], ['An insect', 'Un insecto'],
    ['Something in the sky', 'Algo en el cielo'], ['A name for a pet', 'Un nombre para una mascota'],
  ],
  socialStudies: [
    ['A country', 'Un país'], ['A capital city', 'Una ciudad capital'], ['A body of water', 'Un cuerpo de agua'],
    ['A historical figure', 'Un personaje histórico'], ['An empire or kingdom', 'Un imperio o reino'],
    ['A U.S. state', 'Un estado de EE. UU.'], ['Something in the Constitution', 'Algo en la Constitución'],
    ['A government job', 'Un cargo del gobierno'], ['A word about money', 'Una palabra relacionada con el dinero'],
    ['A landform', 'Un accidente geográfico'], ['A religion or belief system', 'Una religión o sistema de creencias'],
    ['An invention', 'Un invento'], ['A language', 'Un idioma'], ['Something traded on the Silk Road', 'Algo que se comerciaba en la Ruta de la Seda'],
    ['A war or battle', 'Una guerra o batalla'], ['A natural resource', 'Un recurso natural'],
    ['A right or freedom', 'Un derecho o libertad'], ['Something a government provides', 'Algo que proporciona el gobierno'],
    ['A city in Colorado', 'Una ciudad de Colorado'], ['A continent or region', 'Un continente o región'],
    ['A product made in a factory', 'Un producto hecho en una fábrica'], ['A type of government', 'Un tipo de gobierno'],
    ['An ancient monument', 'Un monumento antiguo'], ['Something you’d find on a map', 'Algo que encontrarías en un mapa'],
  ],
}
Object.keys(CATEGORIES).forEach(k => { CATEGORIES[k] = CATEGORIES[k].map(([en, es]) => ({ en, es })) })

// Letters that work well (no Q, U, V, X, Y, Z, like the original game)
export const LETTERS = 'ABCDEFGHIJKLMNOPRSTW'.split('')

// Back to the Board words
export const WORDS = {
  fun: [
    ['pizza', 'pizza'], ['volcano', 'volcán'], ['giraffe', 'jirafa'], ['birthday', 'cumpleaños'], ['snowman', 'muñeco de nieve'],
    ['airplane', 'avión'], ['guitar', 'guitarra'], ['homework', 'tarea'], ['basketball', 'baloncesto'], ['dinosaur', 'dinosaurio'],
    ['rainbow', 'arcoíris'], ['toothbrush', 'cepillo de dientes'], ['superhero', 'superhéroe'], ['pirate', 'pirata'],
    ['library', 'biblioteca'], ['popcorn', 'palomitas'], ['astronaut', 'astronauta'], ['hamburger', 'hamburguesa'],
    ['umbrella', 'paraguas'], ['camping', 'acampar'], ['waterfall', 'cascada'], ['penguin', 'pingüino'], ['robot', 'robot'],
    ['castle', 'castillo'], ['skateboard', 'patineta'], ['sunglasses', 'lentes de sol'], ['tornado', 'tornado'],
    ['cupcake', 'pastelito'], ['soccer', 'fútbol'], ['octopus', 'pulpo'], ['backpack', 'mochila'], ['firefighter', 'bombero'],
    ['vacation', 'vacaciones'], ['ice cream', 'helado'], ['magician', 'mago'], ['telescope', 'telescopio'],
    ['sandwich', 'sándwich'], ['zoo', 'zoológico'], ['earthquake', 'terremoto'], ['bicycle', 'bicicleta'], ['chef', 'chef'],
    ['haunted house', 'casa embrujada'], ['spider', 'araña'], ['piano', 'piano'], ['fireworks', 'fuegos artificiales'],
    ['cell phone', 'celular'], ['mountain', 'montaña'], ['teacher', 'maestro'], ['alarm clock', 'despertador'], ['taco', 'taco'],
  ],
  socialStudies: [
    ['democracy', 'democracia'], ['president', 'presidente'], ['election', 'elección'], ['tax', 'impuesto'], ['pyramid', 'pirámide'],
    ['compass', 'brújula'], ['constitution', 'constitución'], ['king', 'rey'], ['trade', 'comercio'], ['empire', 'imperio'],
    ['judge', 'juez'], ['vote', 'votar'], ['budget', 'presupuesto'], ['citizen', 'ciudadano'], ['ocean', 'océano'],
    ['desert', 'desierto'], ['river', 'río'], ['Congress', 'Congreso'], ['veto', 'veto'], ['law', 'ley'], ['money', 'dinero'],
    ['explorer', 'explorador'], ['Silk Road', 'Ruta de la Seda'], ['Supreme Court', 'Corte Suprema'],
    ['supply and demand', 'oferta y demanda'], ['Bill of Rights', 'Carta de Derechos'], ['revolution', 'revolución'],
    ['latitude', 'latitud'], ['colony', 'colonia'], ['profit', 'ganancia'], ['Great Wall of China', 'Gran Muralla China'],
    ['map', 'mapa'],
  ],
}
Object.keys(WORDS).forEach(k => { WORDS[k] = WORDS[k].map(([en, es]) => ({ en, es })) })
