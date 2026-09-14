import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, ChipRow, Empty, fmtINR } from "@/src/ui";

export default function DonorWall() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sort, setSort] = useState("amount");
  const { data = [], isLoading, refetch, isRefetching } = useQuery({ queryKey: ["donations"], queryFn: api.donations });

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number; last_at?: string }>();
    for (const d of data) {
      const name = d.donor_name || "Anonymous";
      const cur = map.get(name) || { name, total: 0, count: 0 };
      cur.total += d.amount || 0;
      cur.count += 1;
      cur.last_at = d.created_at;
      map.set(name, cur);
    }
    const list = Array.from(map.values());
    if (sort === "alpha") list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => b.total - a.total);
    return list;
  }, [data, sort]);

  const top3 = useMemo(() => [...grouped].sort((a, b) => b.total - a.total).slice(0, 3), [grouped]);
  const total = useMemo(() => grouped.reduce((s, g) => s + g.total, 0), [grouped]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="donor-wall-screen">
      <ScreenHeader title="Donor Wall" subtitle="Our generous sevaks" back onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}>
        {/* Hero — sponsor board look */}
        <LinearGradient colors={[colors.surfaceInverse, colors.info]} style={styles.hero}>
          <Text style={styles.heroMantra}>|| Sponsors ||</Text>
          <Text style={styles.heroBig}>{fmtINR(total)}</Text>
          <Text style={styles.heroSub}>from {grouped.length} generous sevaks</Text>
        </LinearGradient>

        <View style={{ padding: spacing.xl, paddingBottom: 0 }}>
          {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> :
            grouped.length === 0 ? <Empty title="No sponsors yet" body="Log donations to see the wall come alive." testID="donor-empty" /> : (
              <>
                {/* Top 3 Hall of Fame */}
                {top3.length > 0 ? (
                  <>
                    <Text style={styles.section}>🌼 Hall of Fame</Text>
                    <View style={styles.hallRow}>
                      {top3.map((g, i) => (
                        <View key={g.name} style={[styles.hallCard, i === 0 && styles.hallCardGold]}>
                          <Text style={styles.rank}>{["1st", "2nd", "3rd"][i]}</Text>
                          <Text style={styles.hallName} numberOfLines={2}>{g.name}</Text>
                          <Text style={styles.hallAmt}>{fmtINR(g.total)}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

                <Text style={styles.section}>All contributors</Text>
                <View style={{ marginBottom: spacing.md }}>
                  <ChipRow
                    items={[{ label: "By amount", value: "amount" }, { label: "A → Z", value: "alpha" }]}
                    value={sort}
                    onChange={setSort}
                  />
                </View>

                {grouped.map((g, idx) => (
                  <View key={g.name} style={styles.row}>
                    <Text style={styles.rankNo}>{String(idx + 1).padStart(2, "0")}</Text>
                    <View style={styles.avatar}><Text style={styles.aTxt}>{g.name.slice(0, 1).toUpperCase()}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{g.name}</Text>
                      <Text style={styles.meta}>{g.count} contribution{g.count > 1 ? "s" : ""}</Text>
                    </View>
                    <Text style={styles.amt}>{fmtINR(g.total)}</Text>
                  </View>
                ))}
              </>
            )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { padding: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing["2xl"] },
  heroMantra: { color: colors.brandSecondary, fontFamily: fonts.display, fontSize: 14, letterSpacing: 2 },
  heroBig: { color: "#FFFFFF", fontFamily: fonts.display, fontSize: 46, fontWeight: "700", marginTop: 4 },
  heroSub: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 4 },
  section: { fontFamily: fonts.display, fontSize: 20, fontWeight: "600", color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.md },
  hallRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  hallCard: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", minHeight: 130 },
  hallCardGold: { backgroundColor: "#FFF9E6", borderColor: colors.brandSecondary },
  rank: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  hallName: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 15, fontWeight: "600", textAlign: "center", marginTop: 6 },
  hallAmt: { color: colors.brandPrimary, fontFamily: fonts.display, fontSize: 18, fontWeight: "700", marginTop: 6 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  rankNo: { color: colors.muted, fontFamily: fonts.display, fontSize: 14, fontWeight: "700", width: 30 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  aTxt: { color: colors.brandPrimary, fontWeight: "700", fontFamily: fonts.display },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  amt: { color: colors.brandPrimary, fontFamily: fonts.display, fontSize: 17, fontWeight: "700" },
});
