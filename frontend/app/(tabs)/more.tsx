import React from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader } from "@/src/ui";

const MODULE_GROUPS = [
  { title: "FINANCE & ACCOUNTS", items: [
    { key: "donations", label: "Donations", description: "Record seva contributions", symbol: "₹", route: "/module/donations" },
    { key: "expenses", label: "Expenses", description: "Track festival spending", symbol: "↗", route: "/module/expenses" },
    { key: "pending-dues", label: "Pending Dues", description: "Follow up on pledges", symbol: "○", route: "/module/pending-dues" },
  ] },
  { title: "FESTIVAL MANAGEMENT", items: [
    { key: "shifts", label: "Seva & Volunteers", description: "Coordinate service shifts", symbol: "✦", route: "/module/shifts" },
    { key: "prasadam", label: "Prasadam", description: "Manage annadanam roster", symbol: "◇", route: "/module/prasadam" },
    { key: "announcements", label: "Announcements", description: "Keep the committee informed", symbol: "!", route: "/module/announcements" },
    { key: "gallery", label: "Gallery", description: "Share festival memories", symbol: "▧", route: "/module/gallery" },
    { key: "polls", label: "Committee Decisions", description: "Gather votes and opinions", symbol: "◉", route: "/module/polls" },
  ] },
  { title: "YOUR COMMITTEE", items: [
    { key: "profile", label: "Profile", description: "Your seva identity", symbol: "○", route: "/module/profile" },
    { key: "donor-wall", label: "Donor Wall", description: "Honor community supporters", symbol: "✧", route: "/module/donor-wall" },
    { key: "seva-ai", label: "Seva AI", description: "A thoughtful planning companion", symbol: "ॐ", route: "/module/seva-ai" },
    { key: "sms-settings", label: "SMS Settings", description: "Configure thank-you messages", symbol: "✉", route: "/module/sms-settings" },
  ] },
];

export default function More() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const committee = useQuery({ queryKey: ["myCommittee"], queryFn: api.myCommittee });

  const copyCode = () => {
    const code = committee.data?.code;
    if (!code) return;
    if (Platform.OS === "web" && typeof navigator !== "undefined" && (navigator as any).clipboard) {
      (navigator as any).clipboard.writeText(code);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="more-screen">
      <ScreenHeader title="More" subtitle="Modules & tools" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}>
        {committee.data ? (
          <Pressable onPress={copyCode} style={styles.committeeCard} testID="committee-card">
            <View style={{ flex: 1 }}>
              <Text style={styles.commLbl}>YOUR COMMITTEE</Text>
              <Text style={styles.commName}>{committee.data.name}</Text>
              <Text style={styles.commMeta}>{committee.data.member_count} member{committee.data.member_count === 1 ? "" : "s"} · Tap code to copy</Text>
            </View>
            <View style={styles.commCodeBox}>
              <Text style={styles.commCode}>{committee.data.code}</Text>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.profile}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name || "?").slice(0, 1).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.role}>{user?.role}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
        </View>

        {MODULE_GROUPS.map(group => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            {group.items.map(item => (
              <Pressable key={item.key} onPress={() => router.push(item.route as any)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} testID={`tile-${item.key}`}>
                <View style={styles.rowIcon}><Text style={styles.rowSymbol}>{item.symbol}</Text></View>
                <View style={{ flex: 1 }}><Text style={styles.rowLabel}>{item.label}</Text><Text style={styles.rowDescription}>{item.description}</Text></View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        ))}

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
  group: { marginBottom: spacing.xl },
  groupTitle: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: spacing.sm },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  rowPressed: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  rowIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  rowSymbol: { color: colors.brandPrimary, fontFamily: fonts.display, fontSize: 22, fontWeight: "700" },
  rowLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  rowDescription: { color: colors.muted, fontSize: 12, marginTop: 3 },
  chevron: { color: colors.brandPrimary, fontFamily: fonts.display, fontSize: 28, marginLeft: spacing.sm },
  signOut: { marginTop: spacing["2xl"], paddingVertical: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.error, alignItems: "center" },
  signOutText: { color: colors.error, fontWeight: "700" },
  committeeCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brandTertiary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: "rgba(230,81,0,0.2)", marginBottom: spacing.md },
  commLbl: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 1, fontWeight: "800" },
  commName: { fontFamily: fonts.display, fontSize: 18, fontWeight: "600", color: colors.onSurface, marginTop: 4 },
  commMeta: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  commCodeBox: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, minWidth: 90, alignItems: "center" },
  commCode: { color: colors.onBrand, fontFamily: fonts.display, fontSize: 20, fontWeight: "700", letterSpacing: 3 },
});
