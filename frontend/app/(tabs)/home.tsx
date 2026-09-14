import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator, Modal, TextInput } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { storage } from "@/src/utils/storage";
import { intents } from "@/src/intents";
import { colors, fonts, radius, spacing } from "@/src/theme";

const HERO = require("../../assets/images/reference/home-banner.jpeg");
const GANESHA_ICON = require("../../assets/images/vinayaka-icon.png");

// All available quick actions the user can pick from.
type QAItem = { key: string; label: string; symbol: string; route?: string; action?: () => void };
const buildActions = (router: any): QAItem[] => [
  { key: "donation",  label: "Log donation",  symbol: "₹",  action: () => { intents.set("new-donation"); router.push("/module/donations"); } },
  { key: "expense",   label: "Add expense",   symbol: "₹",  action: () => { intents.set("new-expense"); router.push("/module/expenses"); } },
  { key: "dues",      label: "Pending Dues",  symbol: "⏳", route: "/module/pending-dues" },
  { key: "task",      label: "New task",      symbol: "✓",  route: "/(tabs)/tasks" },
  { key: "ann",       label: "Announce",      symbol: "📣", route: "/module/announcements" },
  { key: "ai",        label: "Seva AI",       symbol: "ॐ",  route: "/module/seva-ai" },
  { key: "gallery",   label: "Gallery",       symbol: "🖼", route: "/module/gallery" },
  { key: "polls",     label: "Decisions",     symbol: "🗳", route: "/module/polls" },
  { key: "prasadam",  label: "Prasadam",      symbol: "🍚", route: "/module/prasadam" },
  { key: "donor",     label: "Donor Wall",    symbol: "🌼", route: "/module/donor-wall" },
  { key: "event",     label: "New event",     symbol: "📅", route: "/(tabs)/community" },
  { key: "shifts",    label: "Shifts",        symbol: "⏱",  route: "/module/shifts" },
  { key: "sms",       label: "SMS Setup",     symbol: "✉",  route: "/module/sms-settings" },
];

const DEFAULT_KEYS = ["donation", "expense", "task", "ann", "ai"];
const QA_STORAGE_KEY = "vs_quick_actions_v1";

function fmtINR(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function useCountdown(iso?: string | null, nowTs = 0) {
  return useMemo(() => {
    if (!iso) return null;
    const diff = new Date(iso).getTime() - nowTs;
    if (diff <= 0) return { days: 0, hours: 0, mins: 0, past: true };
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return { days, hours, mins, past: false };
  }, [iso, nowTs]);
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
  const [nowTs, setNowTs] = useState(() => Date.now());
  const cd = useCountdown(data?.festival_start, nowTs);
  const displayCd = cd && !cd.past ? cd : { days: 7, hours: 8, mins: 32, past: false };
  const [festivalEditing, setFestivalEditing] = useState(false);
  const [festivalDraft, setFestivalDraft] = useState("");
  const [festivalSaving, setFestivalSaving] = useState(false);
  const [festivalError, setFestivalError] = useState("");
  const canEditFestival = ["President", "Secretary"].includes(user?.role || "");

  const openFestivalEditor = () => {
    setFestivalDraft(toLocalDateTime(data?.festival_start));
    setFestivalError("");
    setFestivalEditing(true);
  };
  const saveFestivalStart = async () => {
    const parsed = new Date(festivalDraft);
    if (!festivalDraft || Number.isNaN(parsed.getTime())) {
      setFestivalError("Enter a valid date and time.");
      return;
    }
    setFestivalSaving(true);
    setFestivalError("");
    try {
      await api.updateFestivalConfig(parsed.toISOString());
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      setFestivalEditing(false);
    } catch {
      setFestivalError("Could not update the festival start.");
    } finally {
      setFestivalSaving(false);
    }
  };

  // Nearest upcoming pooja/annadanam within 30 min for Aarti Reminder
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

  // Quick Actions: load selection from storage, allow user to edit.
  const [selectedKeys, setSelectedKeys] = useState<string[]>(DEFAULT_KEYS);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    (async () => {
      const raw = await storage.getItem(QA_STORAGE_KEY, "");
      if (typeof raw === "string" && raw) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.every(k => typeof k === "string")) {
            setSelectedKeys(arr);
          }
        } catch {}
      }
    })();
  }, []);
  const persist = async (keys: string[]) => {
    setSelectedKeys(keys);
    await storage.setItem(QA_STORAGE_KEY, JSON.stringify(keys));
  };
  const toggleKey = (k: string) => {
    const next = selectedKeys.includes(k)
      ? selectedKeys.filter(x => x !== k)
      : [...selectedKeys, k];
    persist(next);
  };
  const resetActions = () => persist(DEFAULT_KEYS);
  const allActions = useMemo(() => buildActions(router), [router]);
  const selectedActions = useMemo(
    () => selectedKeys.map(k => allActions.find(a => a.key === k)).filter(Boolean) as QAItem[],
    [selectedKeys, allActions]
  );

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
          colors={["rgba(59,23,27,0.12)", "rgba(59,23,27,0.58)", "rgba(59,23,27,0.96)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, flex: 1, justifyContent: "space-between" }}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.hi}>Namaste,</Text>
              <Text style={styles.who}>{user?.name?.split(" ")[0] || "Sevak"}</Text>
              <Text style={styles.role}>{roleView}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <BellButton />
              <Pressable onPress={signOut} style={styles.logout} testID="logout-button">
                <Text style={styles.logoutText}>Sign out</Text>
              </Pressable>
            </View>
          </View>

          <View style={{ paddingBottom: spacing.xl }}>
            <Text style={styles.heroMantra}>Ganpati Bappa Morya 🙏</Text>
            <Text style={styles.heroTitle}>Namaste, {user?.name?.split(" ")[0] || "Sevak"}</Text>
            <Text style={styles.heroTitle2}>your seva awaits</Text>
          </View>
        </View>
      </View>

      <View style={styles.countdownCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.countdownLabel}>FESTIVAL BEGINS IN</Text>
          <View style={styles.cdRow}><CDBlock v={displayCd.days} label="days" /><CDBlock v={displayCd.hours} label="hrs" /><CDBlock v={displayCd.mins} label="min" /></View>
        </View>
        <Image source={GANESHA_ICON} style={styles.countdownIcon} contentFit="contain" />
        {canEditFestival ? <Pressable onPress={openFestivalEditor} style={styles.festivalEditBtn} testID="festival-edit-button">
          <Text style={styles.festivalEditText}>Edit</Text>
        </Pressable> : null}
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
              <StatCard label="Collected" value={fmtINR(data?.total_donations || 0)} symbol="₹" tone="brand" onPress={() => router.push("/module/donations")} testID="stat-donations" />
              <StatCard label="Spent" value={fmtINR(data?.total_expenses || 0)} symbol="▣" tone="warning" onPress={() => router.push("/module/expenses")} testID="stat-expenses" />
              <StatCard label="Balance" value={fmtINR(data?.balance || 0)} symbol="▥" tone="success" onPress={() => router.push("/module/expenses")} testID="stat-balance" />
              <StatCard label="Pending" value={fmtINR(data?.pending_dues_total || 0)} symbol="⌛" tone="gold" onPress={() => router.push("/module/pending-dues")} testID="stat-pending" />
            </View>

            <View style={styles.miniRow}>
              <MiniCard label="Pending tasks" value={data?.pending_tasks_count || 0} onPress={() => router.push("/(tabs)/tasks")} testID="mini-tasks" />
              <MiniCard label="My tasks" value={data?.my_pending_tasks_count || 0} onPress={() => router.push("/(tabs)/tasks")} testID="mini-my-tasks" />
              <MiniCard label="Critical" value={data?.critical_issues_count || 0} tone="error" onPress={() => router.push("/(tabs)/tasks")} testID="mini-critical" />
            </View>
            {(data?.pending_dues_count || 0) > 0 ? (
              <Pressable onPress={() => router.push("/module/pending-dues")} style={styles.pendingDuesCard} testID="pending-dues-card">
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendingDuesLbl}>PENDING DUES · {data.pending_dues_count} donor{data.pending_dues_count === 1 ? "" : "s"}</Text>
                  <Text style={styles.pendingDuesVal}>{fmtINR(data.pending_dues_total || 0)}</Text>
                  <Text style={styles.pendingDuesNote}>Excluded from Collected & Balance</Text>
                </View>
                <Text style={styles.pendingDuesArrow}>→</Text>
              </Pressable>
            ) : null}

            {/* Quick actions rail */}
            <View style={styles.qaHeaderRow}>
              <Text style={styles.sectionTitle}>Quick actions</Text>
              <Pressable onPress={() => setEditing(true)} style={styles.editBtn} testID="qa-edit-button">
                <Text style={styles.editBtnText}>Edit</Text>
              </Pressable>
            </View>
            {selectedActions.length === 0 ? (
              <Pressable onPress={() => setEditing(true)} style={styles.qaEmpty} testID="qa-empty">
                <Text style={styles.qaEmptyText}>No quick actions yet — tap to pick your favourites</Text>
              </Pressable>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingHorizontal: 2, paddingBottom: 4 }}>
                {selectedActions.map(a => (
                  <QuickAction key={a.key} label={a.label} symbol={a.symbol}
                    onPress={() => a.action ? a.action() : router.push(a.route as any)} testID={`qa-${a.key}`} />
                ))}
              </ScrollView>
            )}

            {/* Today's events */}
            <Text style={styles.sectionTitle}>Todays events</Text>
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
            <View style={styles.quoteCard}>
              <Text style={styles.quoteMark}>“</Text>
              <Text style={styles.quoteText}>Seva is not a task. It is the joy of making space for everyone.</Text>
              <Text style={styles.quoteAttribution}>A little reminder for today</Text>
            </View>
          </>
        )}
      </View>

      {/* Edit Quick Actions Modal */}
      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setEditing(false)} />
        <View style={[styles.editSheet, { paddingBottom: insets.bottom + spacing.xl }]} testID="qa-edit-sheet">
          <View style={styles.editHandle} />
          <View style={styles.editHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.editTitle}>Quick actions</Text>
              <Text style={styles.editSub}>Add or remove shortcuts on your Home screen. Saved on this device.</Text>
            </View>
            <Pressable onPress={resetActions} style={styles.resetBtn} testID="qa-reset-button">
              <Text style={styles.resetTxt}>Reset</Text>
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 460 }}>
            {allActions.map(a => {
              const checked = selectedKeys.includes(a.key);
              return (
                <Pressable key={a.key} onPress={() => toggleKey(a.key)} style={styles.editItem} testID={`qa-toggle-${a.key}`}>
                  <View style={styles.editItemLeft}>
                    <View style={styles.editIcon}><Text style={styles.editIconTxt}>{a.symbol}</Text></View>
                    <Text style={styles.editItemLabel}>{a.label}</Text>
                  </View>
                  <View style={[styles.editCheck, checked && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
                    {checked ? <Text style={{ color: colors.onBrand, fontWeight: "800" }}>✓</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable onPress={() => setEditing(false)} style={styles.doneBtn} testID="qa-done-button">
            <Text style={styles.doneTxt}>Done</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal visible={festivalEditing} transparent animationType="slide" onRequestClose={() => setFestivalEditing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setFestivalEditing(false)} />
        <View style={[styles.editSheet, { paddingBottom: insets.bottom + spacing.xl }]} testID="festival-edit-sheet">
          <View style={styles.editHandle} />
          <Text style={styles.editTitle}>Festival start</Text>
          <Text style={styles.editSub}>Set the date and time shown in the home countdown.</Text>
          <TextInput
            value={festivalDraft}
            onChangeText={setFestivalDraft}
            placeholder="YYYY-MM-DDTHH:MM"
            placeholderTextColor={colors.muted}
            style={styles.festivalInput}
            testID="festival-start-input"
          />
          {festivalError ? <Text style={styles.festivalError}>{festivalError}</Text> : null}
          <View style={styles.festivalActions}>
            <Pressable onPress={() => setFestivalEditing(false)} style={styles.festivalCancel}>
              <Text style={styles.festivalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={saveFestivalStart} disabled={festivalSaving} style={[styles.festivalSave, festivalSaving && { opacity: 0.6 }]} testID="festival-save-button">
              <Text style={styles.festivalSaveText}>{festivalSaving ? "Saving..." : "Save"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function toLocalDateTime(iso?: string | null) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function CDBlock({ v, label }: { v: number; label: string }) {
  return (
    <View style={styles.cdBlock}>
      <Text style={styles.cdV}>{String(v).padStart(2, "0")}</Text>
      <Text style={styles.cdL}>{label}</Text>
    </View>
  );
}

function BellButton() {
  const router = useRouter();
  const { data } = useQuery({ queryKey: ["unreadCount"], queryFn: api.unreadCount });
  const n = data?.unread || 0;
  return (
    <Pressable onPress={() => router.push("/module/notifications")} style={bellStyles.btn} testID="bell-button">
      <Text style={bellStyles.icon}>🔔</Text>
      {n > 0 ? (
        <View style={bellStyles.badge}>
          <Text style={bellStyles.badgeText}>{n > 99 ? "99+" : n}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const bellStyles = StyleSheet.create({
  btn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  icon: { fontSize: 18 },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surfaceInverse },
  badgeText: { color: colors.onError, fontSize: 10, fontWeight: "800" },
});

function StatCard({ label, value, symbol, tone, onPress, testID }: any) {
  const tones: Record<string, { bg: string; fg: string }> = {
    brand: { bg: colors.brandTertiary, fg: colors.brandPrimary },
    success: { bg: "#E8F5E9", fg: colors.success },
    warning: { bg: "#FFF8E1", fg: colors.warning },
    gold: { bg: "#FFF9E6", fg: "#8B6B00" },
    error: { bg: "#FCE8E8", fg: colors.error },
  };
  const t = tones[tone] || tones.brand;
  return (
    <Pressable onPress={onPress} style={[styles.statCard, { backgroundColor: t.bg }]} testID={testID}>
      <View style={styles.statTop}><View style={[styles.statIcon, { backgroundColor: t.fg }]}><Text style={styles.statIconText}>{symbol}</Text></View><Text style={[styles.statLabel, { color: t.fg }]}>{label}</Text></View>
      <Text style={[styles.statValue, { color: t.fg }]}>{value}</Text>
    </Pressable>
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

function QuickAction({ label, symbol = "ॐ", onPress, testID }: any) {
  return (
    <Pressable onPress={onPress} style={styles.qa} testID={testID}>
      <View style={styles.qaCircle}><Text style={styles.qaDot}>{symbol}</Text></View>
      <Text style={styles.qaLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { height: 286, backgroundColor: colors.surfaceInverse, overflow: "hidden" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  hi: { color: "rgba(255,255,255,0.75)", fontSize: 14, fontFamily: fonts.text },
  who: { color: "#FFFFFF", fontSize: 26, fontFamily: fonts.display, fontWeight: "600" },
  role: { color: colors.brandSecondary, fontSize: 12, marginTop: 2, letterSpacing: 1, textTransform: "uppercase" },
  logout: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.15)" },
  logoutText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },

  heroMantra: { color: colors.brandSecondary, fontFamily: fonts.display, fontSize: 12, letterSpacing: 2, marginBottom: 4 },
  heroTitle: { color: "#FFFFFF", fontFamily: fonts.display, fontSize: 28, lineHeight: 32, fontWeight: "600" },
  heroTitle2: { color: colors.brandSecondary, fontFamily: fonts.display, fontSize: 22, lineHeight: 27, fontWeight: "600", marginBottom: spacing.md },

  cdRow: { flexDirection: "row", gap: spacing.md },
  cdBlock: { backgroundColor: "#FFFDF9", paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, minWidth: 54, alignItems: "center", borderWidth: 1, borderColor: "#F2DEC6" },
  cdV: { color: colors.surfaceInverse, fontFamily: fonts.display, fontSize: 27, fontWeight: "700" },
  cdL: { color: colors.surfaceInverse, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: "700" },
  countdownCard: { flexDirection: "row", alignItems: "center", marginHorizontal: spacing.xl, marginTop: -22, padding: spacing.lg, backgroundColor: "#FFF8EE", borderRadius: radius.lg, borderWidth: 1, borderColor: "#F2DEC6", shadowColor: colors.surfaceInverse, shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  countdownLabel: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 17, fontWeight: "700", marginBottom: spacing.sm },
  countdownEmpty: { color: colors.muted, fontSize: 13 },
  countdownIcon: { width: 68, height: 68, marginLeft: spacing.sm, opacity: 0.78 },
  festivalEditBtn: { marginLeft: spacing.sm, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandPrimary },
  festivalEditText: { color: colors.brandPrimary, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.md },
  statCard: { width: "48%", minHeight: 104, borderRadius: radius.lg, padding: spacing.lg, justifyContent: "space-between" },
  statTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  statIconText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  statLabel: { flex: 1, fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },
  statValue: { fontSize: 24, fontFamily: fonts.display, fontWeight: "700", marginTop: 8 },

  miniRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  miniCard: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  miniVal: { fontSize: 22, fontFamily: fonts.display, color: colors.onSurface, fontWeight: "700" },
  miniLbl: { fontSize: 11, color: colors.muted, marginTop: 2, textAlign: "center" },

  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md, fontSize: 20, fontFamily: fonts.display, color: colors.onSurface, fontWeight: "600" },

  qa: { alignItems: "center", width: 82 },
  qaCircle: { width: 62, height: 62, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: 6, borderWidth: 1, borderColor: "rgba(230,81,0,0.15)" },
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
  qaHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.md },
  editBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandPrimary },
  editBtnText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase" },
  qaEmpty: { backgroundColor: colors.brandTertiary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(230,81,0,0.2)", borderStyle: "dashed" },
  qaEmptyText: { color: colors.brandPrimary, textAlign: "center", fontWeight: "600" },
  quoteCard: { marginTop: spacing.xl, padding: spacing.xl, backgroundColor: colors.brandTertiary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  quoteMark: { color: colors.brandSecondary, fontFamily: fonts.display, fontSize: 42, lineHeight: 34 },
  quoteText: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 20, lineHeight: 26, fontWeight: "600" },
  quoteAttribution: { color: colors.brandPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 0.8, marginTop: spacing.md, textTransform: "uppercase" },
  backdrop: { flex: 1, backgroundColor: "rgba(59,23,27,0.5)" },
  editSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "88%" },
  editHandle: { alignSelf: "center", width: 42, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  editHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.md },
  editTitle: { fontFamily: fonts.display, fontSize: 22, fontWeight: "600", color: colors.onSurface },
  editSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  resetBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  resetTxt: { color: colors.onSurfaceTertiary, fontWeight: "700", fontSize: 12 },
  editItem: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  editItemLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: spacing.md },
  editIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  editIconTxt: { fontSize: 20, color: colors.brandPrimary, fontFamily: fonts.display },
  editItemLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  editCheck: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  festivalInput: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: 14, color: colors.onSurface, fontSize: 16, marginTop: spacing.lg },
  festivalError: { color: colors.error, fontSize: 13, marginTop: spacing.sm },
  festivalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  festivalCancel: { flex: 1, minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  festivalCancelText: { color: colors.onSurfaceTertiary, fontWeight: "700" },
  festivalSave: { flex: 1, minHeight: 50, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  festivalSaveText: { color: colors.onBrand, fontWeight: "800" },
  doneBtn: { marginTop: spacing.md, paddingVertical: 16, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center" },
  doneTxt: { color: colors.onBrand, fontSize: 15, fontWeight: "700" },
  pendingDuesCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF3E0", borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.warning, marginTop: spacing.md },
  pendingDuesLbl: { color: colors.warning, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  pendingDuesVal: { color: colors.warning, fontFamily: fonts.display, fontSize: 24, fontWeight: "700", marginTop: 4 },
  pendingDuesNote: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2, fontStyle: "italic" },
  pendingDuesArrow: { color: colors.warning, fontSize: 24, fontWeight: "700" },
});
