// Simple, cute, data-driven avatars — no external image files, so no hosting cost and it works offline.
// Each preset picks a base color, an ear/head silhouette, and an accessory drawn on top.

export const AVATAR_PRESETS = [
  { id: 'dolphin-tophat', label: 'Dolphin in a top hat', color: '#38BDF8', ear: 'fin', accessory: 'tophat' },
  { id: 'gator-shades', label: 'Alligator in sunglasses', color: '#4ADE80', ear: 'small', accessory: 'shades' },
  { id: 'giraffe-shades', label: 'Giraffe in sunglasses', color: '#FBBF24', ear: 'horns', accessory: 'shades' },
  { id: 'panda-bowtie', label: 'Panda in a bow tie', color: '#E2E8F0', ear: 'round', accessory: 'bowtie', dark: true },
  { id: 'fox-monocle', label: 'Fox with a monocle', color: '#FB923C', ear: 'pointy', accessory: 'monocle' },
  { id: 'owl-headphones', label: 'Owl with headphones', color: '#A78BFA', ear: 'tufts', accessory: 'headphones' },
  { id: 'bear-partyhat', label: 'Bear in a party hat', color: '#B45309', ear: 'round', accessory: 'partyhat' },
  { id: 'cat-mustache', label: 'Cat with a mustache', color: '#94A3B8', ear: 'pointy', accessory: 'mustache' },
  { id: 'elephant-crown', label: 'Elephant in a flower crown', color: '#CBD5E1', ear: 'floppy', accessory: 'crown' },
  { id: 'penguin-scarf', label: 'Penguin in a scarf', color: '#334155', ear: 'none', accessory: 'scarf' },
  { id: 'lion-shades', label: 'Lion in sunglasses', color: '#FACC15', ear: 'mane', accessory: 'shades' },
  { id: 'rabbit-bowtie', label: 'Rabbit in a bow tie', color: '#FBCFE8', ear: 'long', accessory: 'bowtie' },
  { id: 'koala-headphones', label: 'Koala with headphones', color: '#CBD5E1', ear: 'round-big', accessory: 'headphones' },
  { id: 'hippo-tophat', label: 'Hippo in a top hat', color: '#F0ABFC', ear: 'small', accessory: 'tophat' },
  { id: 'raccoon-shades', label: 'Raccoon in sunglasses', color: '#9CA3AF', ear: 'pointy', accessory: 'shades', mask: true },
  { id: 'sloth-beanie', label: 'Sloth in a beanie', color: '#D6B88A', ear: 'round', accessory: 'beanie' },
]

function Ears({ type, color }) {
  switch (type) {
    case 'fin':
      return <path d="M 50 8 C 46 8 43 16 46 24 C 48 20 52 20 54 24 C 57 16 54 8 50 8 Z" fill={color} />
    case 'small':
      return (
        <>
          <circle cx={30} cy={26} r={6} fill={color} />
          <circle cx={70} cy={26} r={6} fill={color} />
        </>
      )
    case 'horns':
      return (
        <>
          <rect x={38} y={10} width={5} height={14} rx={2.5} fill={color} />
          <rect x={57} y={10} width={5} height={14} rx={2.5} fill={color} />
          <circle cx={40.5} cy={10} r={4} fill="#B45309" />
          <circle cx={59.5} cy={10} r={4} fill="#B45309" />
        </>
      )
    case 'round':
      return (
        <>
          <circle cx={26} cy={22} r={11} fill={color} />
          <circle cx={74} cy={22} r={11} fill={color} />
        </>
      )
    case 'round-big':
      return (
        <>
          <circle cx={20} cy={30} r={16} fill={color} />
          <circle cx={80} cy={30} r={16} fill={color} />
        </>
      )
    case 'pointy':
      return (
        <>
          <polygon points="22,30 32,4 40,28" fill={color} />
          <polygon points="78,30 68,4 60,28" fill={color} />
        </>
      )
    case 'tufts':
      return (
        <>
          <polygon points="34,20 30,2 42,16" fill={color} />
          <polygon points="66,20 70,2 58,16" fill={color} />
        </>
      )
    case 'floppy':
      return (
        <>
          <ellipse cx={16} cy={38} rx={14} ry={20} fill={color} />
          <ellipse cx={84} cy={38} rx={14} ry={20} fill={color} />
        </>
      )
    case 'mane':
      return (
        <circle cx={50} cy={40} r={40} fill="#CA8A04" opacity={0.9} style={{ clipPath: 'circle(40px at 50px 40px)' }} />
      )
    case 'long':
      return (
        <>
          <ellipse cx={35} cy={6} rx={7} ry={20} fill={color} />
          <ellipse cx={65} cy={6} rx={7} ry={20} fill={color} />
        </>
      )
    default:
      return null
  }
}

function Accessory({ type }) {
  const cx = 50
  const cy = 50
  switch (type) {
    case 'tophat':
      return (
        <g>
          <rect x={cx - 15} y={cy - 46} width={30} height={20} rx={2} fill="#1E293B" />
          <rect x={cx - 20} y={cy - 28} width={40} height={6} rx={3} fill="#1E293B" />
          <rect x={cx - 15} y={cy - 38} width={30} height={4} fill="#DC2626" />
        </g>
      )
    case 'shades':
      return (
        <g>
          <rect x={cx - 22} y={cy - 8} width={18} height={13} rx={6} fill="#0F172A" />
          <rect x={cx + 4} y={cy - 8} width={18} height={13} rx={6} fill="#0F172A" />
          <rect x={cx - 5} y={cy - 4} width={10} height={3} fill="#0F172A" />
        </g>
      )
    case 'bowtie':
      return (
        <g>
          <polygon points={`${cx - 14},${cy + 26} ${cx - 2},${cy + 21} ${cx - 2},${cy + 31}`} fill="#EF4444" />
          <polygon points={`${cx + 14},${cy + 26} ${cx + 2},${cy + 21} ${cx + 2},${cy + 31}`} fill="#EF4444" />
          <circle cx={cx} cy={cy + 26} r={3.5} fill="#B91C1C" />
        </g>
      )
    case 'monocle':
      return (
        <g>
          <circle cx={cx + 10} cy={cy - 1} r={9} fill="none" stroke="#1E293B" strokeWidth={2.5} />
          <line x1={cx + 17} y1={cy + 7} x2={cx + 22} y2={cy + 20} stroke="#1E293B" strokeWidth={1.5} />
        </g>
      )
    case 'headphones':
      return (
        <g>
          <path d={`M ${cx - 25} ${cy - 4} A 25 25 0 0 1 ${cx + 25} ${cy - 4}`} fill="none" stroke="#334155" strokeWidth={5} />
          <rect x={cx - 30} y={cy - 8} width={10} height={16} rx={4} fill="#334155" />
          <rect x={cx + 20} y={cy - 8} width={10} height={16} rx={4} fill="#334155" />
        </g>
      )
    case 'partyhat':
      return (
        <g>
          <polygon points={`${cx},${cy - 48} ${cx - 15},${cy - 22} ${cx + 15},${cy - 22}`} fill="#F472B6" />
          <circle cx={cx - 6} cy={cy - 40} r={2.5} fill="#FDE047" />
          <circle cx={cx + 5} cy={cy - 32} r={2.5} fill="#67E8F9" />
          <circle cx={cx} cy={cy - 48} r={3} fill="#FBBF24" />
        </g>
      )
    case 'mustache':
      return <path d={`M ${cx - 15} ${cy + 9} Q ${cx - 6} ${cy + 2} ${cx} ${cy + 9} Q ${cx + 6} ${cy + 2} ${cx + 15} ${cy + 9} Q ${cx + 7} ${cy + 15} ${cx} ${cy + 9} Q ${cx - 7} ${cy + 15} ${cx - 15} ${cy + 9} Z`} fill="#292524" />
    case 'crown':
      return (
        <g>
          {[-18, -9, 0, 9, 18].map((dx, i) => (
            <circle key={i} cx={cx + dx} cy={cy - 34 + Math.abs(dx) * 0.35} r={5.5} fill={i % 2 ? '#F472B6' : '#FDE047'} />
          ))}
        </g>
      )
    case 'scarf':
      return <rect x={cx - 17} y={cy + 15} width={34} height={10} rx={4} fill="#EF4444" />
    case 'beanie':
      return (
        <g>
          <path d={`M ${cx - 19} ${cy - 8} A 19 19 0 0 1 ${cx + 19} ${cy - 8} L ${cx + 19} ${cy - 1} L ${cx - 19} ${cy - 1} Z`} fill="#0891B2" />
          <rect x={cx - 20} y={cy - 4} width={40} height={7} rx={3.5} fill="#0E7490" />
          <circle cx={cx} cy={cy - 27} r={4} fill="#F0F9FF" />
        </g>
      )
    default:
      return null
  }
}

export function findAvatarPreset(id) {
  return AVATAR_PRESETS.find((p) => p.id === id) || EMOJI_PRESETS.find((p) => p.id === id) || null
}

// Real, recognizable emoji — genuine variety without bundling downloaded photos (which would
// carry licensing risk in a redistributable app). Grouped for a friendlier picker.
export const EMOJI_CATEGORIES = [
  {
    name: 'Animals',
    items: ['🦊', '🐨', '🦁', '🐯', '🐼', '🐻', '🐰', '🐸', '🐙', '🦉', '🦄', '🐢', '🦋', '🐝', '🦈', '🐳', '🦖', '🐧', '🦔', '🐿️'],
  },
  { name: 'Nature', items: ['🌵', '🌸', '🌻', '🍁', '🌈', '⭐', '🌙', '☀️', '🔥', '❄️', '🌊', '🍀'] },
  { name: 'Food', items: ['🍕', '🍩', '🍎', '🍉', '🥑', '🍦', '🍪', '🌮', '🍓', '🥐'] },
  { name: 'Objects', items: ['🎧', '📚', '🎨', '🚀', '🎸', '⚡', '🔬', '🎮', '🧩', '🛹', '📷', '🏆'] },
  { name: 'Faces', items: ['😎', '🤓', '🥳', '🤖', '👽', '🥸', '🦸', '🧙', '🧑‍🚀', '🧑‍🎨'] },
]
export const EMOJI_PRESETS = EMOJI_CATEGORIES.flatMap((cat) =>
  cat.items.map((emoji) => ({ id: `emoji-${emoji.codePointAt(0).toString(16)}`, emoji, category: cat.name, kind: 'emoji' })),
)

export function AvatarSVG({ preset, size = 40 }) {
  if (!preset) return null
  if (preset.kind === 'emoji') {
    return (
      <div
        className="rounded-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-cyan-100"
        style={{ width: size, height: size, fontSize: size * 0.6, lineHeight: 1 }}
      >
        {preset.emoji}
      </div>
    )
  }
  const eyeColor = '#1E293B'
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="rounded-full">
      <circle cx={50} cy={50} r={50} fill={preset.color} />
      <Ears type={preset.ear} color={preset.color} />
      <circle cx={50} cy={54} r={30} fill={preset.color} />
      {preset.mask && <ellipse cx={50} cy={48} rx={26} ry={13} fill="#1E293B" opacity={0.85} />}
      <circle cx={40} cy={52} r={4.2} fill={eyeColor} />
      <circle cx={60} cy={52} r={4.2} fill={eyeColor} />
      <circle cx={41.3} cy={50.7} r={1.3} fill="white" />
      <circle cx={61.3} cy={50.7} r={1.3} fill="white" />
      <ellipse cx={50} cy={64} rx={6} ry={4} fill={preset.dark ? '#0F172A' : '#00000022'} />
      <Accessory type={preset.accessory} />
    </svg>
  )
}
