import React from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, TextInputProps, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, radius, spacing } from "@/src/theme";

export function ScreenHeader({ title, subtitle, right, back, onBack }: {
  title: string; subtitle?: string; right?: React.ReactNode; back?: boolean; onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
          {back && (
            <Pressable onPress={onBack} hitSlop={12} style={{ marginRight: spacing.md }} testID="back-button">
              <Text style={{ fontSize: 26, color: colors.brandPrimary }}>‹</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: "600", color: colors.onSurface }}>{title}</Text>
            {subtitle ? <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>{subtitle}</Text> : null}
          </View>
        </View>
        {right}
      </View>
    </View>
  );
}

export function Chip({ label, active, onPress, testID }: { label: string; active?: boolean; onPress?: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} testID={testID}
      style={[{
        flexShrink: 0,
        paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill,
        alignItems: "center", justifyContent: "center", borderWidth: 1,
        backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary,
        borderColor: active ? colors.brandPrimary : colors.border,
      }]}>
      <Text style={{ color: active ? colors.onBrand : colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ items, value, onChange }: { items: { label: string; value: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 56 }} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl, alignItems: "center", height: 56 }}>
      {items.map(i => (
        <Chip key={i.value} label={i.label} active={value === i.value} onPress={() => onChange(i.value)} testID={`chip-${i.value}`} />
      ))}
    </ScrollView>
  );
}

export function Button({ label, onPress, tone = "primary", disabled, testID, style }: {
  label: string; onPress?: () => void; tone?: "primary" | "ghost" | "gold"; disabled?: boolean; testID?: string; style?: any;
}) {
  const tones = {
    primary: { bg: colors.brandPrimary, fg: colors.onBrand },
    gold: { bg: colors.brandSecondary, fg: colors.onBrandSecondary },
    ghost: { bg: "transparent", fg: colors.brandPrimary },
  } as const;
  const t = tones[tone];
  return (
    <Pressable onPress={onPress} disabled={disabled} testID={testID}
      style={[{ paddingVertical: 16, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: t.bg, alignItems: "center", opacity: disabled ? 0.5 : 1, borderWidth: tone === "ghost" ? 1 : 0, borderColor: colors.brandPrimary }, style]}>
      <Text style={{ color: t.fg, fontSize: 15, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ fontSize: 12, color: colors.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6, fontWeight: "600" }}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={{ backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 15, color: colors.onSurface, borderWidth: 1, borderColor: colors.border }}
        {...props}
      />
    </View>
  );
}

export function BottomSheet({ visible, onClose, title, children, testID }: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode; testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(43,34,30,0.5)" }} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View testID={testID} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, maxHeight: "88%" }}>
          <View style={{ alignSelf: "center", width: 42, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.lg }} />
          <Text style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: "600", color: colors.onSurface, marginBottom: spacing.lg }}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Empty({ title, body, testID }: { title: string; body?: string; testID?: string }) {
  return (
    <View testID={testID} style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing["2xl"], alignItems: "center", marginTop: spacing.md }}>
      <Text style={{ fontSize: 42, marginBottom: spacing.sm }}>🌼</Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, fontWeight: "600" }}>{title}</Text>
      {body ? <Text style={{ color: colors.muted, textAlign: "center", marginTop: 6, fontSize: 13, lineHeight: 20 }}>{body}</Text> : null}
    </View>
  );
}

export const cardStyles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
});

export function priorityColor(p: string) {
  return p === "critical" ? colors.error : p === "high" ? colors.warning : p === "medium" ? colors.brandPrimary : colors.muted;
}

export function fmtINR(n: number) {
  return "₹" + Math.round(n || 0).toLocaleString("en-IN");
}
