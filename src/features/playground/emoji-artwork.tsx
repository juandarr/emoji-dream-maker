/** Keep the original Noto artwork, using its scalable COLRv1 color outlines. */
export default function EmojiArtwork({glyph}:{glyph:string}) {
  return <span className="pg-artwork" aria-hidden="true"><span className="pg-vector-glyph">{glyph}</span></span>;
}
