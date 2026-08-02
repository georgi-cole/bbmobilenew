export const GALLERY_HOUSEMATES = [
  { name: 'LIA', file: 'Lia_avatar.webp' },
  { name: 'REMY', file: 'Remy_avatar.webp' },
  { name: 'NICO', file: 'Nico_avatar.webp' },
  { name: 'VEE', file: 'Vee_avatar.webp' },
  { name: 'QUINN', file: 'Quinn_avatar.webp' },
  { name: 'ECHO', file: 'Echo_avatar.webp' },
  { name: 'RUNE', file: 'Rune_avatar.webp' },
  { name: 'KIAN', file: 'Kian_avatar.webp' },
  { name: 'RAE', file: 'Rae_avatar.webp' },
  { name: 'LUX', file: 'Lux_avatar.webp' },
  { name: 'BLUE', file: 'Blue_avatar.webp' },
  { name: 'DEX', file: 'Dex_avatar.webp' },
  { name: 'FINN', file: 'Finn_avatar.webp' },
  { name: 'MIMI', file: 'mimi_avatar.webp' },
  { name: 'ZED', file: 'Zed_avatar.webp' },
] as const

export interface GalleryPortraitSpec {
  name: string
  file: string
  mirrored: boolean
}

/** Part 1's Twin Shock clue: Lia and her mirrored counterpart are guaranteed. */
export function chooseClassicTwinHintPortraits(
  galleryPortraits: readonly number[]
): GalleryPortraitSpec[] {
  const randomIndices = [...galleryPortraits, ...GALLERY_HOUSEMATES.map((_, index) => index)]
    .filter((index, position, all) => index !== 0 && all.indexOf(index) === position)
    .slice(0, 2)
  const lia = GALLERY_HOUSEMATES[0]
  return [
    { name: 'LIA', file: lia.file, mirrored: false },
    {
      name: GALLERY_HOUSEMATES[randomIndices[0]].name,
      file: GALLERY_HOUSEMATES[randomIndices[0]].file,
      mirrored: false,
    },
    { name: 'ALI', file: lia.file, mirrored: true },
    {
      name: GALLERY_HOUSEMATES[randomIndices[1]].name,
      file: GALLERY_HOUSEMATES[randomIndices[1]].file,
      mirrored: false,
    },
  ]
}
