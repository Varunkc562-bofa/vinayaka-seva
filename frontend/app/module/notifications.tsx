import React, { useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, Empty } from "@/src/ui";

const KIND_ICON: Record<string, string> = {
  donation: "₹", expense: "💸", event: "📅", announcement: "📣",
};
const KIND_TINT: Record<string, string> = {
  donation: colors.brandPrimary, expense: colors.error,
  event: colors.success, announcement: colors.brandSecondary,
};

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const s = Math.max(0, Math.round((Date.now() - d) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  return `${dd}d ago`;
}

export default function Notifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["notifications"], queryFn: api.notifications,
  });
  const markAll = useMutation({
    mutationFn: () => api.markRead(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["unreadCount"] }); },
  });

  // Mark all as read when viewing the feed
  useEffect(() => {
    if (data?.unread) markAll.mutate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.unread]);

  const items = data?.items || [];
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="notifications-screen">
      <ScreenHeader title="Activity" subtitle="What your committee is doing" back onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}>
        {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> :
         items.length === 0 ? <Empty title="No activity yet" body="You'll see every donation, expense, event and announcement here." testID="ntf-empty" /> :
         items.map((n: any) => (
          <View key={n.notification_id} style={[styles.card, !n.is_read && styles.unread]}>
            <View style={[styles.icon, { backgroundColor: (KIND_TINT[n.kind] || colors.brandPrimary) + "22" }]}>
              <Text style={[styles.iconTxt, { color: KIND_TINT[n.kind] || colors.brandPrimary }]}>{KIND_ICON[n.kind] || "•"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.headRow}>
                <Text style={styles.title} numberOfLines={1}>{n.title}</Text>
                {!n.is_read ? <View style={styles.dot} /> : null}
              </View>
              {n.body ? <Text style={styles.body} numberOfLines={2}>{n.body}</Text> : null}
              <Text style={styles.meta}>{n.by_name} · {timeAgo(n.created_at)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  unread: { backgroundColor: colors.brandTertiary, borderColor: "rgba(230,81,0,0.2)" },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  iconTxt: { fontSize: 20, fontFamily: fonts.display, fontWeight: "700" },
  headRow: { flexDirection: "row", alignItems: "center" },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 15, fontWeight: "600", color: colors.onSurface },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary },
  body: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 2, lineHeight: 18 },
  meta: { color: colors.muted, fontSize: 11, marginTop: 4, letterSpacing: 0.3 },
});
