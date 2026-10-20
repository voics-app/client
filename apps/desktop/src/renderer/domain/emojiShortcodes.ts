/** Unicode emoji reachable through `:shortcode:` autocomplete. */
export const EMOJI_SHORTCODES: Record<string, string> = {
  grinning: '😀', smiley: '😃', smile: '😄', grin: '😁', laughing: '😆', sweat_smile: '😅', joy: '😂', rofl: '🤣',
  slight_smile: '🙂', wink: '😉', blush: '😊', innocent: '😇', heart_eyes: '😍', star_struck: '🤩', kissing_heart: '😘',
  yum: '😋', stuck_out_tongue: '😛', zany_face: '🤪', thinking: '🤔', raised_eyebrow: '🤨', neutral_face: '😐',
  expressionless: '😑', rolling_eyes: '🙄', smirk: '😏', sleeping: '😴', open_mouth: '😮', cry: '😢', sob: '😭',
  triumph: '😤', rage: '😡', partying_face: '🥳', sunglasses: '😎', exploding_head: '🤯', flushed: '😳',
  pleading_face: '🥺', scream: '😱', hugging: '🤗', saluting_face: '🫡', melting_face: '🫠', skull: '💀', ghost: '👻',
  clown: '🤡', poop: '💩', robot: '🤖', alien: '👽', sneezing_face: '🤧', nauseated_face: '🤢', face_palm: '🤦',
  shrug: '🤷', thumbsup: '👍', thumbsdown: '👎', clap: '👏', raised_hands: '🙌', pray: '🙏', handshake: '🤝',
  wave: '👋', victory: '✌️', crossed_fingers: '🤞', call_me: '🤙', muscle: '💪', eyes: '👀', heart_hands: '🫶',
  ok_hand: '👌', point_up: '☝️', point_right: '👉', point_left: '👈', fist: '✊', punch: '👊', brain: '🧠',
  heart: '❤️', orange_heart: '🧡', yellow_heart: '💛', green_heart: '💚', blue_heart: '💙', purple_heart: '💜',
  black_heart: '🖤', white_heart: '🤍', broken_heart: '💔', sparkling_heart: '💖', hundred: '💯', sparkles: '✨',
  fire: '🔥', star: '⭐', tada: '🎉', confetti_ball: '🎊', balloon: '🎈', gift: '🎁', trophy: '🏆', medal: '🏅',
  video_game: '🎮', headphones: '🎧', musical_note: '🎵', guitar: '🎸', microphone: '🎤', pizza: '🍕', hamburger: '🍔',
  fries: '🍟', taco: '🌮', sushi: '🍣', cake: '🎂', cookie: '🍪', coffee: '☕', beer: '🍺', wine_glass: '🍷',
  rocket: '🚀', airplane: '✈️', car: '🚗', bike: '🚲', bulb: '💡', pushpin: '📌', paperclip: '📎', lock: '🔒',
  key: '🔑', zap: '⚡', moon: '🌙', sunny: '☀️', cloud: '☁️', rainbow: '🌈', snowflake: '❄️', umbrella: '☂️',
  cat: '🐱', dog: '🐶', fox: '🦊', bear: '🐻', panda: '🐼', frog: '🐸', monkey: '🐵', unicorn: '🦄', bee: '🐝',
  butterfly: '🦋', snake: '🐍', turtle: '🐢', penguin: '🐧', rat: '🐀', rabbit: '🐰', mouse: '🐭',
  eggplant: '🍆', peach: '🍑', apple: '🍎', banana: '🍌', watermelon: '🍉', strawberry: '🍓', avocado: '🥑',
  warning: '⚠️', white_check_mark: '✅', x: '❌', question: '❓', exclamation: '❗', no_entry: '⛔', checkmark: '✔️',
  arrow_up: '⬆️', arrow_down: '⬇️', arrow_left: '⬅️', arrow_right: '➡️', rewind: '⏪', fast_forward: '⏩',
  bell: '🔔', mute: '🔇', loud_sound: '🔊', mag: '🔍', link: '🔗', hammer: '🔨', wrench: '🔧', gear: '⚙️',
  computer: '💻', phone: '📱', keyboard: '⌨️', camera: '📷', book: '📖', memo: '📝', calendar: '📅', pencil: '✏️',
  moneybag: '💰', gem: '💎', crown: '👑', ring: '💍', bomb: '💣', dart: '🎯', game_die: '🎲', jigsaw: '🧩',
  earth_africa: '🌍', house: '🏠', beach: '🏖️', mountain: '⛰️', tree: '🌳', rose: '🌹', sunflower: '🌻',
};

export interface EmojiMatch {
  name: string;
  emoji: string;
}

/** Names starting with the query rank above names merely containing it. */
export function searchShortcodes(query: string, limit = 8): EmojiMatch[] {
  const q = query.toLowerCase();
  if (!q) return [];
  const prefix: EmojiMatch[] = [];
  const contains: EmojiMatch[] = [];
  for (const [name, emoji] of Object.entries(EMOJI_SHORTCODES)) {
    if (name.startsWith(q)) prefix.push({ name, emoji });
    else if (name.includes(q)) contains.push({ name, emoji });
  }
  return [...prefix, ...contains].slice(0, limit);
}
