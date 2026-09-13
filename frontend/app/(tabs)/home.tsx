import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1662031225146-42e30158e800?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHwyfHxMb3JkJTIwR2FuZXNoYSUyMGlkb2wlMjBmZXN0aXZhbHxlbnwwfHx8fDE3ODkyODM4NjJ8MA&ixlib=rb-4.1.0&q=85";

function fmtINR(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function useCountdown(iso?: string | null) {
  return useMemo(() => {
    if (!iso) return null;
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return { days: 0, hours: 0, mins: 0, past: true };
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return { days, hours, mins, past: false };
  }, [iso]);
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard"], queryFn: api.dashboard,
  });
  const events = useQuery({ queryKey: ["events"], queryFn: api.events });
  const cd = useCountdown(data?.festival_start);

  // Nearest upcoming pooja/annadanam within 30 min for Aarti Reminder
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const aarti = useMemo(() => {
    const list = (events.data || []).filter((e: any) =>
      ["pooja", "annadanam"].includes(e.category));
    let best: any = null;
    let bestDelta = Infinity;
    for (const e of list) {
      const t = new Date(e.starts_at).getTime();
      const delta = t - nowTs;
      if (delta > -600_000 && delta < 30 * 60_000 && delta < bestDelta) {
        best = e; bestDelta = delta;
      }
    }
    if (!best) return null;
    const remainMs = new Date(best.starts_at).getTime() - nowTs;
    return { event: best, remainMs };
  }, [events.data, nowTs]);

  const roleView = user?.role || "Member";

  const seed = async () => {
    try { await api.seed(); qc.invalidateQueries({ queryKey: ["dashboard"] }); }
    catch (e) { console.warn(e); }
  };

  return (
    <ScrollView
      testID="home-screen"
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingBottom: spacing["3xl"] }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient
          colors={["rgba(43,34,30,0.15)", "rgba(43,34,30,0.55)", "rgba(43,34,30,0.95)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, flex: 1, justifyContent: "space-between" }}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.hi}>Namaste,</Text>
              <Text style={styles.who}>{user?.name?.split(" ")[0] || "Sevak"}</Text>
              <Text style={styles.role}>{roleView}</Text>
            </View>
            <Pressable onPress={signOut} style={styles.logout} testID="logout-button">
              <Text style={styles.logoutText}>Sign out</Text>
            </Pressable>
          </View>

          <View style={{ paddingBottom: spacing.xl }}>
            <Text style={styles.heroMantra}>|| Ganpati Bappa Morya ||</Text>
            <Text style={styles.heroTitle}>Festival</Text>
            <Text style={styles.heroTitle2}>begins in</Text>
            {cd ? (
              <View style={styles.cdRow}>
                <CDBlock v={cd.days} label="days" />
                <CDBlock v={cd.hours} label="hrs" />
                <CDBlock v={cd.mins} label="min" />
              </View>
            ) : <Text style={styles.role}>Set festival date in Settings</Text>}
          </View>
        </View>
      </View>

      {/* Stats grid */}
      <View style={{ padding: spacing.xl }}>
        {/* Aarti Reminder */}
        {aarti ? (
          <Pressable onPress={() => router.push("/module/prasadam")} style={styles.aartiCard} testID="aarti-reminder">
            <View style={styles.aartiLeft}>
              <Text style={styles.aartiTag}>🪔 UPCOMING SEVA</Text>
              <Text style={styles.aartiTitle}>{aarti.event.title}</Text>
              <Text style={styles.aartiMeta}>{aarti.event.location || "Community Pandal"} · {aarti.event.category}</Text>
            </View>
            <View style={styles.aartiTimer}>
              <Text style={styles.aartiTimerBig}>
                {aarti.remainMs > 0
                  ? `${Math.floor(aarti.remainMs / 60000)}m`
                  : "NOW"}
              </Text>
              <Text style={styles.aartiTimerLbl}>{aarti.remainMs > 0 ? "to go" : "starting"}</Text>
            </View>
          </Pressable>
        ) : null}

        {/* Live indicator */}
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE · everyone sees the same data</Text>
        </View>

        {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : (
          <>
            <View style={styles.grid}>
              <StatCard label="Collected" value={fmtINR(data?.total_donations || 0)} tone="brand" testID="stat-donations" />
              <StatCard label="Spent" value={fmtINR(data?.total_expenses || 0)} tone="warning" testID="stat-expenses" />
              <StatCard label="Balance" value={fmtINR(data?.balance || 0)} tone="success" testID="stat-balance" />
              <StatCard label="Volunteers" value={String(data?.active_volunteers || 0)} tone="gold" testID="stat-volunteers" />
            </View>

            <View style={styles.miniRow}>
              <MiniCard label="Pending tasks" value={data?.pending_tasks_count || 0} onPress={() => router.push("/(tabs)/tasks")} testID="mini-tasks" />
              <MiniCard label="My tasks" value={data?.my_pending_tasks_count || 0} onPress={() => router.push("/(tabs)/tasks")} testID="mini-my-tasks" />
              <MiniCard label="Critical" value={data?.critical_issues_count || 0} tone="error" onPress={() => router.push("/(tabs)/tasks")} testID="mini-critical" />
            </View>

            {/* Quick actions rail */}
            <Text style={styles.sectionTitle}>Quick actions</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingHorizontal: 2, paddingBottom: 4 }}>
              <QuickAction label="Log donation" onPress={() => router.push("/module/donations")} testID="qa-donation" />
              <QuickAction label="Add expense" onPress={() => router.push("/module/expenses")} testID="qa-expense" />
              <QuickAction label="New task" onPress={() => router.push("/(tabs)/tasks")} testID="qa-task" />
              <QuickAction label="Announce" onPress={() => router.push("/module/announcements")} testID="qa-ann" />
              <QuickAction label="Seva AI" onPress={() => router.push("/module/seva-ai")} testID="qa-ai" />
            </ScrollView>

            {/* Today's events */}
            <Text style={styles.sectionTitle}>Today's events</Text>
            {(data?.todays_events || []).length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Nothing on the schedule today</Text>
                <Text style={styles.emptyBody}>Peaceful morning. Add events from Community.</Text>
              </View>
            ) : (data?.todays_events || []).map((e: any) => (
              <View key={e.event_id} style={styles.eventCard}>
                <Text style={styles.eventTitle}>{e.title}</Text>
                <Text style={styles.eventMeta}>{e.location} · {e.category}</Text>
              </View>
            ))}

            {/* Announcements */}
            <Text style={styles.sectionTitle}>Recent announcements</Text>
            {(data?.recent_announcements || []).length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No announcements yet</Text>
                <Pressable onPress={seed} style={styles.seedBtn} testID="seed-button">
                  <Text style={styles.seedText}>Load demo data</Text>
                </Pressable>
              </View>
            ) : (data?.recent_announcements || []).map((a: any) => (
              <View key={a.announcement_id} style={styles.annCard}>
                <Text style={styles.annTitle}>{a.title}</Text>
                <Text style={styles.annBody} numberOfLines={3}>{a.body}</Text>
                <Text style={styles.annMeta}>{a.author} · {a.author_role}</Text>
              </View>
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function CDBlock({ v, label }: { v: number; label: string }) {
  return (
    <View style={styles.cdBlock}>
      <Text style={styles.cdV}>{String(v).padStart(2, "0")}</Text>
      <Text style={styles.cdL}>{label}</Text>
    </View>
  );
}

function StatCard({ label, value, tone, testID }: any) {
  const tones: Record<string, { bg: string; fg: string }> = {
    brand: { bg: colors.brandTertiary, fg: colors.brandPrimary },
    success: { bg: "#E8F5E9", fg: colors.success },
    warning: { bg: "#FFF8E1", fg: colors.warning },
    gold: { bg: "#FFF9E6", fg: "#8B6B00" },
    error: { bg: "#FCE8E8", fg: colors.error },
  };
  const t = tones[tone] || tones.brand;
  return (
    <View style={[styles.statCard, { backgroundColor: t.bg }]} testID={testID}>
      <Text style={[styles.statLabel, { color: t.fg }]}>{label}</Text>
      <Text style={[styles.statValue, { color: t.fg }]}>{value}</Text>
    </View>
  );
}

function MiniCard({ label, value, tone, onPress, testID }: any) {
  return (
    <Pressable onPress={onPress} style={styles.miniCard} testID={testID}>
      <Text style={[styles.miniVal, tone === "error" && { color: colors.error }]}>{value}</Text>
      <Text style={styles.miniLbl}>{label}</Text>
    </Pressable>
  );
}

function QuickAction({ label, onPress, testID }: any) {
  return (
    <Pressable onPress={onPress} style={styles.qa} testID={testID}>
      <View style={styles.qaCircle}><Text style={styles.qaDot}>ॐ</Text></View>
      <Text style={styles.qaLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { height: 380, backgroundColor: "#2B221E", overflow: "hidden" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  hi: { color: "rgba(255,255,255,0.75)", fontSize: 14, fontFamily: fonts.text },
  who: { color: "#FFFFFF", fontSize: 26, fontFamily: fonts.display, fontWeight: "600" },
  role: { color: colors.brandSecondary, fontSize: 12, marginTop: 2, letterSpacing: 1, textTransform: "uppercase" },
  logout: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.15)" },
  logoutText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },

  heroMantra: { color: colors.brandSecondary, fontFamily: fonts.display, fontSize: 13, letterSpacing: 2, marginBottom: 4 },
  heroTitle: { color: "#FFFFFF", fontFamily: fonts.display, fontSize: 40, lineHeight: 44, fontWeight: "600" },
  heroTitle2: { color: colors.brandSecondary, fontFamily: fonts.display, fontSize: 40, lineHeight: 44, fontWeight: "600", marginBottom: spacing.md },

  cdRow: { flexDirection: "row", gap: spacing.md },
  cdBlock: { backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md, minWidth: 76, alignItems: "center", borderWidth: 1, borderColor: "rgba(212,175,55,0.3)" },
  cdV: { color: "#FFFFFF", fontFamily: fonts.display, fontSize: 26, fontWeight: "700" },
  cdL: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.md },
  statCard: { width: "48%", minHeight: 96, borderRadius: radius.lg, padding: spacing.lg, justifyContent: "space-between" },
  statLabel: { fontSize: 13, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  statValue: { fontSize: 24, fontFamily: fonts.display, fontWeight: "700", marginTop: 8 },

  miniRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  miniCard: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  miniVal: { fontSize: 22, fontFamily: fonts.display, color: colors.onSurface, fontWeight: "700" },
  miniLbl: { fontSize: 11, color: colors.muted, marginTop: 2, textAlign: "center" },

  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md, fontSize: 20, fontFamily: fonts.display, color: colors.onSurface, fontWeight: "600" },

  qa: { alignItems: "center", width: 80 },
  qaCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: 6, borderWidth: 1, borderColor: "rgba(230,81,0,0.15)" },
  qaDot: { fontSize: 26, color: colors.brandPrimary, fontFamily: fonts.display },
  qaLabel: { fontSize: 11, color: colors.onSurface, textAlign: "center" },

  emptyCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.onSurface },
  emptyBody: { color: colors.muted, fontSize: 13, marginTop: 4, textAlign: "center" },
  seedBtn: { marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10, backgroundColor: colors.brandPrimary, borderRadius: radius.pill },
  seedText: { color: colors.onBrand, fontWeight: "700" },

  eventCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  eventTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.onSurface, fontWeight: "600" },
  eventMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },

  annCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  annTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.onSurface, fontWeight: "600" },
  annBody: { color: colors.onSurfaceTertiary, fontSize: 14, marginTop: 4, lineHeight: 20 },
  annMeta: { color: colors.muted, fontSize: 11, marginTop: 6, letterSpacing: 0.5 },
  aartiCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brandTertiary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: "rgba(230,81,0,0.3)", marginBottom: spacing.lg },
  aartiLeft: { flex: 1 },
  aartiTag: { color: colors.brandPrimary, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  aartiTitle: { fontFamily: fonts.display, fontSize: 18, fontWeight: "700", color: colors.onSurface },
  aartiMeta: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  aartiTimer: { alignItems: "center", backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, minWidth: 68 },
  aartiTimerBig: { color: colors.onBrand, fontFamily: fonts.display, fontSize: 22, fontWeight: "700" },
  aartiTimerLbl: { color: colors.onBrand, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: "700" },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveText: { color: colors.success, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
});
