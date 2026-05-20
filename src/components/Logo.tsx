import React from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

/**
 * Mobile Wiki logo — "Riso" direction (selected design, v3 option 04):
 * phone + open book + knowledge nodes in a three-ink risograph idiom.
 *
 * Flat port of the design prototype. react-native-svg does not support SVG
 * filters (the paper/grain feTurbulence) or mixBlendMode, so those texture
 * layers are intentionally omitted; the shapes, colours, and opacities that
 * carry the mark are preserved exactly.
 */
const PAPER = '#f4ede0';
const PINK = '#ff3d7f';
const BLUE = '#2540ff';
const YELLOW = '#ffd13b';
const INK = '#1a1a1a';

const PAGE_LINES = [94, 102, 110, 118, 126, 134, 142, 150];

function LogoInner({
  size = 96,
  rounded = true,
}: {
  size?: number;
  /** Apply the rounded-square clip. Off for full-bleed launcher rendering. */
  rounded?: boolean;
}): React.JSX.Element {
  const body = (
    <>
      <Rect width="240" height="240" fill={PAPER} />

      {/* Yellow knowledge nodes */}
      <Circle cx="44" cy="58" r="20" fill={YELLOW} opacity={0.92} />
      <Circle cx="196" cy="74" r="14" fill={YELLOW} opacity={0.92} />
      <Circle cx="48" cy="186" r="16" fill={YELLOW} opacity={0.92} />
      <Circle cx="198" cy="178" r="18" fill={YELLOW} opacity={0.92} />

      {/* Black connection lines node → phone */}
      <G stroke={INK} strokeWidth={2} opacity={0.85}>
        <Line x1="44" y1="58" x2="84" y2="80" />
        <Line x1="196" y1="74" x2="156" y2="86" />
        <Line x1="48" y1="186" x2="84" y2="170" />
        <Line x1="198" y1="178" x2="156" y2="166" />
      </G>

      {/* Pink phone body */}
      <Rect x="84" y="44" width="72" height="156" rx="12" fill={PINK} opacity={0.86} />
      {/* Cream screen knockout */}
      <Rect x="90" y="62" width="60" height="124" rx="4" fill={PAPER} />
      {/* Speaker pill */}
      <Rect x="111" y="52" width="18" height="3" rx="1.5" fill={INK} opacity={0.7} />

      {/* Blue open book */}
      <Path d="M94 80 L120 86 L120 168 L94 162 Z" fill={BLUE} opacity={0.82} />
      <Path d="M146 80 L120 86 L120 168 L146 162 Z" fill={BLUE} opacity={0.82} />
      {/* Cream spine + page lines */}
      <Line x1="120" y1="86" x2="120" y2="168" stroke={PAPER} strokeWidth={1} opacity={0.85} />
      {PAGE_LINES.map((y, i) => (
        <G key={y}>
          <Rect x="98" y={y} width={16 - i * 0.6} height="1.4" fill={PAPER} opacity={0.8} />
          <Rect x="126" y={y} width={16 - i * 0.6} height="1.4" fill={PAPER} opacity={0.8} />
        </G>
      ))}

      {/* Node centre dots */}
      <G fill={INK}>
        <Circle cx="44" cy="58" r="3.5" />
        <Circle cx="196" cy="74" r="3" />
        <Circle cx="48" cy="186" r="3" />
        <Circle cx="198" cy="178" r="3.5" />
      </G>

      {/* Registration marks */}
      <G stroke={INK} strokeWidth={1} opacity={0.4}>
        <Line x1="18" y1="222" x2="32" y2="222" />
        <Line x1="25" y1="215" x2="25" y2="229" />
        <Line x1="208" y1="18" x2="222" y2="18" />
        <Line x1="215" y1="11" x2="215" y2="25" />
      </G>

      <SvgText
        x="120"
        y="225"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="6.5"
        fill={INK}
        opacity={0.55}
      >
        MOBILE WIKI
      </SvgText>
    </>
  );

  return (
    <Svg width={size} height={size} viewBox="0 0 240 240">
      {rounded ? (
        <>
          <Defs>
            <ClipPath id="logo-clip">
              <Rect width="240" height="240" rx="52" />
            </ClipPath>
          </Defs>
          <G clipPath="url(#logo-clip)">{body}</G>
        </>
      ) : (
        body
      )}
    </Svg>
  );
}

export const Logo = React.memo(LogoInner);
