// Vinayaka Seva - Warm devotional design system
import { useMemo } from "react";
import { Appearance, Platform, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFF9F1",
  onSurface: "#32231F",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#32231F",
  surfaceTertiary: "#F8EEE2",
  onSurfaceTertiary: "#66534B",
  surfaceInverse: "#3B171B",
  onSurfaceInverse: "#FFFFFF",
  muted: "#89766D",

  brand: "#D95722",
  onBrand: "#FFFFFF",
  brandPrimary: "#D95722",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#D4A72C",
  onBrandSecondary: "#32231F",
  brandTertiary: "#FBE5D8",
  onBrandTertiary: "#A63D1C",

  success: "#3A8054",
  onSuccess: "#FFFFFF",
  warning: "#C88420",
  onWarning: "#32231F",
  error: "#9E2B35",
  onError: "#FFFFFF",
  info: "#713139",
  onInfo: "#FFFFFF",

  border: "#F0DFCE",
  borderStrong: "#DFC5AF",
  divider: "#F0DFCE",
};

export type ThemeColors = typeof light;
export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 } as const;
export const radius = { sm: 8, md: 16, lg: 24, pill: 999 } as const;

export const fonts = {
  display: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" }) as string,
  text: Platform.select({ ios: "System", android: "sans-serif", default: "System" }) as string,
};

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme || defaultScheme);
}
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system === "dark" && themes.dark ? "dark" : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const colors = light;
