import React from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, Empty } from "@/src/ui";

export default function Shifts() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data = [], isLoading, refetch, isRefetching } = useQuery({ queryKey: ["events"], queryFn: api.events });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="shifts-screen">
      <ScreenHeader title="Shifts & Duty" subtitle="Volunteer schedule" back onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}>
        {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> :
         data.length === 0 ? <Empty title="No shifts scheduled yet" body="Shifts follow the event schedule — add events first." testID="shifts-empty" /> :
         data.map((e: any) => (
          <View key={e.event_id} style={styles.card}>
            <Text style={styles.time}>{fmt(e.starts_at)}</Text>
            <Text style={styles.title}>{e.title}</Text>
            <Text style={styles.meta}>{e.location || "TBD"} · {e.category}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function fmt(iso: string) {
  try { return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return iso; }
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  time: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  title: { fontFamily: fonts.display, fontSize: 18, fontWeight: "600", color: colors.onSurface, marginTop: 4 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 4 },
});
