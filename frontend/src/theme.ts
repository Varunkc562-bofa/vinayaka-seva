// Vinayaka Seva - Saffron/Gold/Cream design system
import { useMemo } from "react";
import { Appearance, Platform, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FAFAF5",
  onSurface: "#2A2421",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#2A2421",
  surfaceTertiary: "#F1EFE7",
  onSurfaceTertiary: "#4A403A",
  surfaceInverse: "#2B221E",
  onSurfaceInverse: "#FFFFFF",
  muted: "#7D746D",

  brand: "#E65100",
  onBrand: "#FFFFFF",
  brandPrimary: "#E65100",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#D4AF37",
  onBrandSecondary: "#2A2421",
  brandTertiary: "#FBE9E7",
  onBrandTertiary: "#E65100",

  success: "#2E7D32",
  onSuccess: "#FFFFFF",
  warning: "#F57F17",
  onWarning: "#2A2421",
  error: "#800000",
  onError: "#FFFFFF",
  info: "#4E342E",
  onInfo: "#FFFFFF",

  border: "#E8E5DA",
  borderStrong: "#D7D2C1",
  divider: "#E8E5DA",
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
  Appearance.setColorScheme?.(scheme);
}
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
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
