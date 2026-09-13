import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, Empty, fmtINR } from "@/src/ui";

export default function PendingDues() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["pendingDues"], queryFn: api.pendingDues,
  });

  const totals = useMemo(() => {
    let pledged = 0, paid = 0, remaining = 0;
    for (const d of data as any[]) {
      pledged += d.amount || 0;
      paid += d.paid_amount || 0;
      remaining += d.remaining || 0;
    }
    return { pledged, paid, remaining };
  }, [data]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="pending-dues-screen">
      <ScreenHeader title="Pending Dues" subtitle="Pledged but not yet paid" back onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}>
        <View style={styles.hero}>
          <Text style={styles.heroLbl}>TOTAL PENDING</Text>
          <Text style={styles.heroVal}>{fmtINR(totals.remaining)}</Text>
          <Text style={styles.heroMeta}>{data.length} donor{data.length === 1 ? "" : "s"} · Pledged {fmtINR(totals.pledged)} · Paid {fmtINR(totals.paid)}</Text>
          <Text style={styles.note}>Pending dues are excluded from Collected & Balance</Text>
        </View>

        {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> :
         data.length === 0 ? <Empty title="No pending dues" body="All pledges are fully paid — Ganpati Bappa Morya!" testID="pending-empty" /> :
         data.map((d: any) => {
          const pct = d.amount > 0 ? Math.round((d.paid_amount / d.amount) * 100) : 0;
          return (
            <Pressable key={d.donation_id} onPress={() => router.push("/module/donations")} style={styles.card} testID={`due-${d.donation_id}`}>
              <View style={styles.head}>
                <View style={styles.avatar}><Text style={styles.aTxt}>{d.donor_name?.slice(0, 1).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{d.donor_name}</Text>
                  <Text style={styles.subtle}>{d.mode?.toUpperCase()}{d.phone ? " · " + d.phone : ""}</Text>
                </View>
                <View style={styles.remWrap}>
                  <Text style={styles.remLbl}>DUE</Text>
                  <Text style={styles.remVal}>{fmtINR(d.remaining)}</Text>
                </View>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
              <View style={styles.numbers}>
                <View><Text style={styles.numLbl}>Pledged</Text><Text style={styles.numVal}>{fmtINR(d.amount)}</Text></View>
                <View><Text style={styles.numLbl}>Paid</Text><Text style={[styles.numVal, { color: colors.success }]}>{fmtINR(d.paid_amount)}</Text></View>
                <View><Text style={styles.numLbl}>Progress</Text><Text style={[styles.numVal, { color: colors.brandPrimary }]}>{pct}%</Text></View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.warning, borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.xl },
  heroLbl: { color: "rgba(42,36,33,0.7)", fontSize: 11, letterSpacing: 1, fontWeight: "700" },
  heroVal: { color: colors.onWarning, fontFamily: fonts.display, fontSize: 42, fontWeight: "700", marginTop: 6 },
  heroMeta: { color: "rgba(42,36,33,0.85)", fontSize: 13, marginTop: 6 },
  note: { color: "rgba(42,36,33,0.65)", fontSize: 11, marginTop: 6, fontStyle: "italic" },
  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  head: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  aTxt: { color: colors.brandPrimary, fontWeight: "700", fontFamily: fonts.display, fontSize: 18 },
  name: { fontFamily: fonts.display, fontSize: 17, fontWeight: "600", color: colors.onSurface },
  subtle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  remWrap: { alignItems: "flex-end" },
  remLbl: { color: colors.warning, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  remVal: { color: colors.warning, fontFamily: fonts.display, fontSize: 20, fontWeight: "700" },
  progressBar: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary, overflow: "hidden", marginBottom: spacing.md },
  progressFill: { height: "100%", backgroundColor: colors.success },
  numbers: { flexDirection: "row", justifyContent: "space-between" },
  numLbl: { color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  numVal: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 16, fontWeight: "700", marginTop: 2 },
});
