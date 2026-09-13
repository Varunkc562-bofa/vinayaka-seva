import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, Button } from "@/src/ui";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="profile-screen">
      <ScreenHeader title="Profile" back onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}>
        <View style={styles.hero}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name || "?").slice(0, 1).toUpperCase()}</Text></View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.role}>{user?.role}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
        <View style={styles.card}>
          <Row label="Name" value={user?.name || "—"} />
          <Row label="Email" value={user?.email || "—"} />
          <Row label="Role" value={user?.role || "—"} />
        </View>
        <Button label="Sign out" tone="ghost" onPress={signOut} style={{ marginTop: spacing.xl, borderColor: colors.error }} testID="profile-signout" />
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLbl}>{label}</Text>
      <Text style={styles.rowVal}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md, borderWidth: 1, borderColor: "rgba(230,81,0,0.2)" },
  avatarText: { color: colors.brandPrimary, fontFamily: fonts.display, fontSize: 34, fontWeight: "700" },
  name: { fontFamily: fonts.display, fontSize: 24, fontWeight: "600", color: colors.onSurface },
  role: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 4 },
  email: { color: colors.muted, fontSize: 13, marginTop: 2 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLbl: { color: colors.muted, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: "600" },
  rowVal: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
});
