import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import { useThemeColor } from 'heroui-native';
import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

/**
 * The backdrop behind the Welcome hero, in one fill: a faint accent wash over the
 * whole screen, a soft accent glow behind the icon, and a 22pt lattice of dots faded
 * out towards the edges. About a third of the dots flash to near-black for a moment
 * on their own 4-10s timers, so a handful are dark at any instant and the rest sit
 * quiet. Without the wash and glow the screen reads as flat white on a device.
 *
 * One Skia runtime shader draws the whole thing in a single fill, so a few hundred
 * independently-timed dots cost the same as one. The web build swaps in
 * dot-grid.web.tsx (CanvasKit is not loaded there).
 */
const source = Skia.RuntimeEffect.Make(`
uniform float2 u_res;
uniform float  u_time;
uniform float3 u_color;
uniform float3 u_accent;

const float CELL = 22.0;

float hash(float2 g) {
  return fract(sin(dot(g, float2(12.9898, 78.233))) * 43758.5453);
}

half4 main(float2 p) {
  float2 g = floor(p / CELL);
  float2 c = (g + 0.5) * CELL;
  float disc = 1.0 - smoothstep(1.0, 1.7, distance(p, c));

  float h = hash(g);
  float active = step(0.7, h);
  float period = 4.0 + fract(h * 7.31) * 6.0;
  float phase = fract(u_time / period + h);
  float spike = smoothstep(0.38, 0.5, phase) * (1.0 - smoothstep(0.5, 0.62, phase));
  float alpha = 0.12 + active * spike * 0.78;

  float2 centre = float2(u_res.x * 0.5, u_res.y * 0.42);
  float2 q = (p - centre) / float2(u_res.x * 0.7, u_res.y * 0.55);
  float mask = 1.0 - smoothstep(0.3, 1.0, length(q));

  // Accent wash (whole screen, strongest at the top) + glow behind the icon.
  float wash = 0.05 * (1.0 - p.y / u_res.y);
  float2 gq = (p - centre) / float2(u_res.x * 0.62, u_res.y * 0.30);
  float glow = 0.30 * (1.0 - smoothstep(0.0, 1.0, length(gq)));
  float tint = wash + glow;

  float dots = alpha * disc * mask;
  // Premultiplied: dots over tint over nothing.
  half3 rgb = half3(u_accent) * tint * (1.0 - dots) + half3(u_color) * dots;
  return half4(rgb, tint * (1.0 - dots) + dots);
}
`);

export function DotGrid() {
  const { width, height } = useWindowDimensions();
  const [foreground, accent] = useThemeColor(['foreground', 'accent']);
  const clock = useClock();

  const colors = useMemo(() => {
    const [fr, fg, fb] = Skia.Color(foreground);
    const [ar, ag, ab] = Skia.Color(accent);
    return { fg: [fr, fg, fb] as const, accent: [ar, ag, ab] as const };
  }, [foreground, accent]);

  const uniforms = useDerivedValue(
    () => ({
      u_res: [width, height],
      u_time: clock.get() / 1000,
      u_color: colors.fg,
      u_accent: colors.accent,
    }),
    [width, height, colors],
  );

  if (!source) return null;
  // StyleSheet, not className: Uniwind does not style Skia's Canvas, and a className
  // here left it zero-sized (blank backdrop on device).
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill>
        <Shader source={source} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
