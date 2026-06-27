import React, { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Svg, { Defs, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

/*
 * Blob color palettes — vivid for dark theme, muted for light theme.
 * Each screen gets a unique accent arrangement.
 */
const DARK_BLOBS = {
  default:   { c1: '#60A5FA', c2: '#A78BFA', c3: '#34D399' },
  analytics: { c1: '#A78BFA', c2: '#F472B6', c3: '#60A5FA' },
  activity:  { c1: '#34D399', c2: '#60A5FA', c3: '#FCD34D' },
  bills:     { c1: '#FB923C', c2: '#F87171', c3: '#A78BFA' },
  cards:     { c1: '#818CF8', c2: '#34D399', c3: '#F472B6' },
};

const LIGHT_BLOBS = {
  default:   { c1: '#3B82F6', c2: '#8B5CF6', c3: '#10B981' },
  analytics: { c1: '#8B5CF6', c2: '#EC4899', c3: '#3B82F6' },
  activity:  { c1: '#10B981', c2: '#3B82F6', c3: '#F59E0B' },
  bills:     { c1: '#F97316', c2: '#EF4444', c3: '#8B5CF6' },
  cards:     { c1: '#6366F1', c2: '#10B981', c3: '#EC4899' },
};

export default function MeshBackground({ blobs = 'default', isDark = true }) {
  const [dims, setDims] = useState(Dimensions.get('screen'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ screen }) => setDims(screen));
    return () => sub?.remove();
  }, []);

  const { width, height } = dims;
  const palette = isDark ? DARK_BLOBS : LIGHT_BLOBS;
  const { c1, c2, c3 } = palette[blobs] ?? palette.default;

  // Dark theme: white lines; Light theme: dark lines
  const lineColor  = isDark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.055)';
  // Blob opacity is higher in dark (vivid glow), softer in light
  const o1 = isDark ? '0.14' : '0.09';
  const o2 = isDark ? '0.10' : '0.07';
  const o3 = isDark ? '0.07' : '0.05';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          {/* 44×44 repeating grid lines */}
          <Pattern id="mesh_grid" x="0" y="0" width="44" height="44" patternUnits="userSpaceOnUse">
            <Path
              d="M 44 0 L 0 0 0 44"
              fill="none"
              stroke={lineColor}
              strokeWidth="0.8"
            />
          </Pattern>

          <RadialGradient id="blob_a" cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor={c1} stopOpacity={o1} />
            <Stop offset="100%" stopColor={c1} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="blob_b" cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor={c2} stopOpacity={o2} />
            <Stop offset="100%" stopColor={c2} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="blob_c" cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor={c3} stopOpacity={o3} />
            <Stop offset="100%" stopColor={c3} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Grid fill */}
        <Rect x="0" y="0" width={width} height={height} fill="url(#mesh_grid)" />

        {/* Top-left blob */}
        <Rect
          x={-width * 0.20} y={-height * 0.08}
          width={width * 0.85} height={height * 0.45}
          fill="url(#blob_a)"
        />
        {/* Top-right blob */}
        <Rect
          x={width * 0.35} y={height * 0.05}
          width={width * 0.80} height={height * 0.45}
          fill="url(#blob_b)"
        />
        {/* Bottom-center blob */}
        <Rect
          x={width * 0.05} y={height * 0.60}
          width={width * 0.90} height={height * 0.48}
          fill="url(#blob_c)"
        />
      </Svg>
    </View>
  );
}
