import React from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader } from "@/src/ui";

const MODULES = [
  { key: "donations", label: "Donations", symbol: "₹", route: "/module/donations", tint: "#E65100" },
  { key: "pending-dues", label: "Pending Dues", symbol: "⏳", route: "/module/pending-dues", tint: "#F57F17" },
  { key: "expenses", label: "Expenses", symbol: "₹", route: "/module/expenses", tint: "#800000" },
  { key: "seva-ai", label: "Seva AI", symbol: "ॐ", route: "/module/seva-ai", tint: "#D4AF37" },
  { key: "announcements", label: "Announce", symbol: "📣", route: "/module/announcements", tint: "#F57F17" },
  { key: "gallery", label: "Gallery", symbol: "🖼", route: "/module/gallery", tint: "#2E7D32" },
  { key: "polls", label: "Decisions", symbol: "🗳", route: "/module/polls", tint: "#4E342E" },
  { key: "donor-wall", label: "Donor Wall", symbol: "🌼", route: "/module/donor-wall", tint: "#B8860B" },
  { key: "prasadam", label: "Prasadam", symbol: "🍚", route: "/module/prasadam", tint: "#6B4E3D" },
  { key: "shifts", label: "Shifts", symbol: "⏱", route: "/module/shifts", tint: "#2E7D32" },
  { key: "sms-settings", label: "SMS Setup", symbol: "✉", route: "/module/sms-settings", tint: "#4E342E" },
  { key: "profile", label: "Profile", symbol: "🌸", route: "/module/profile", tint: "#8B6B00" },
];

export default function More() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="more-screen">
      <ScreenHeader title="More" subtitle="Modules & tools" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}>
        <View style={styles.profile}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name || "?").slice(0, 1).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.role}>{user?.role}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
        </View>

        <View style={styles.grid}>
          {MODULES.map(m => (
            <Pressable key={m.key} onPress={() => router.push(m.route as any)} style={styles.tile} testID={`tile-${m.key}`}>
              <View style={[styles.tileIcon, { backgroundColor: m.tint + "18" }]}>
                <Text style={[styles.tileSymbol, { color: m.tint }]}>{m.symbol}</Text>
              </View>
              <Text style={styles.tileLabel}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={signOut} style={styles.signOut} testID="signout-button">
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginRight: spacing.lg, borderWidth: 1, borderColor: "rgba(230,81,0,0.2)" },
  avatarText: { color: colors.brandPrimary, fontFamily: fonts.display, fontSize: 26, fontWeight: "700" },
  name: { fontFamily: fonts.display, fontSize: 20, fontWeight: "600", color: colors.onSurface },
  role: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginTop: 2 },
  email: { color: colors.muted, fontSize: 12, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: { width: "31%", aspectRatio: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", padding: spacing.md },
  tileIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  tileSymbol: { fontSize: 26, fontFamily: fonts.display, fontWeight: "700" },
  tileLabel: { fontSize: 12, fontFamily: fonts.text, color: colors.onSurface, textAlign: "center", fontWeight: "600" },
  signOut: { marginTop: spacing["2xl"], paddingVertical: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.error, alignItems: "center" },
  signOutText: { color: colors.error, fontWeight: "700" },
});
