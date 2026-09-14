import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, RefreshControl, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, Empty } from "@/src/ui";

const OFFICERS = ["President", "Vice President", "Secretary", "Food Coordinator", "Volunteer Coordinator"];

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return iso; }
}

export default function Prasadam() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data = [], isLoading, refetch, isRefetching } = useQuery({ queryKey: ["rsvpSummary"], queryFn: api.rsvpSummary });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [plus, setPlus] = useState<Record<string, number>>({});

  const rsvpM = useMutation({
    mutationFn: ({ id, status, plus_ones }: any) => api.rsvp(id, status, plus_ones),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rsvpSummary"] }),
  });

  const editRsvpM = useMutation({
    mutationFn: ({ eid, uid, data }: any) => api.editRsvp(eid, uid, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rsvpSummary"] }),
  });

  const removeRsvpM = useMutation({
    mutationFn: ({ eid, uid }: any) => api.removeRsvp(eid, uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rsvpSummary"] }),
  });

  const isOfficer = OFFICERS.includes(user?.role || "");

  const annadanam = data.filter((e: any) => e.category === "annadanam");
  const others = data.filter((e: any) => e.category !== "annadanam");

  const commonRow = (e: any) => (
    <EventRow key={e.event_id} e={e} user={user}
      isOfficer={isOfficer}
      expanded={expanded === e.event_id}
      onToggle={() => setExpanded(expanded === e.event_id ? null : e.event_id)}
      plusOnes={plus[e.event_id] || 0}
      setPlus={(n) => setPlus({ ...plus, [e.event_id]: n })}
      onRsvp={(status) => rsvpM.mutate({ id: e.event_id, status, plus_ones: plus[e.event_id] || 0 })}
      onAdjustPlus={(uid: string, next: number) =>
        editRsvpM.mutate({ eid: e.event_id, uid, data: { plus_ones: next } })}
      onRemove={(uid: string, name: string) => {
        Alert.alert("Remove RSVP", `Remove ${name} from this roster?`,
          [{ text: "Cancel", style: "cancel" },
           { text: "Remove", style: "destructive", onPress: () => removeRsvpM.mutate({ eid: e.event_id, uid }) }]);
      }} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="prasadam-screen">
      <ScreenHeader title="Prasadam Roster" subtitle={isOfficer ? "Tap ✎ to adjust plus-ones · ✕ to remove" : "Headcount for every seva"} back onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}>
        {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : (
          <>
            <Text style={styles.section}>🍚 Annadanam</Text>
            {annadanam.length === 0 ? <Empty title="No annadanam yet" body="Add an event with category 'annadanam' from Community." testID="anna-empty" /> :
              annadanam.map(commonRow)}

            {others.length > 0 ? (
              <>
                <Text style={styles.section}>Other events</Text>
                {others.map(commonRow)}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function EventRow({ e, expanded, onToggle, plusOnes, setPlus, onRsvp, user, isOfficer, onAdjustPlus, onRemove }: any) {
  return (
    <Pressable onPress={onToggle} style={styles.card} testID={`prasadam-event-${e.event_id}`}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{e.title}</Text>
          <Text style={styles.date}>{fmtDate(e.starts_at)} · {e.location || "TBD"}</Text>
        </View>
        <View style={styles.count}>
          <Text style={styles.countBig}>{e.headcount}</Text>
          <Text style={styles.countLbl}>heads</Text>
        </View>
      </View>
      <View style={styles.pills}>
        <View style={styles.pill}><Text style={styles.pillTxt}>✓ {e.yes} yes</Text></View>
        <View style={styles.pill}><Text style={styles.pillTxt}>? {e.maybe} maybe</Text></View>
        <View style={styles.pill}><Text style={styles.pillTxt}>× {e.no} no</Text></View>
      </View>
      {expanded ? (
        <View style={styles.rsvpArea}>
          <Text style={styles.rsvpLbl}>Bringing family? Add plus-ones:</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
            {[0, 1, 2, 3, 4].map(n => (
              <Pressable key={n} onPress={() => setPlus(n)} testID={`plus-${e.event_id}-${n}`}
                style={[styles.numBtn, plusOnes === n && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
                <Text style={{ color: plusOnes === n ? colors.onBrand : colors.onSurface, fontWeight: "700" }}>+{n}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable onPress={() => onRsvp("yes")} style={[styles.rsvpBtn, { backgroundColor: colors.success }]} testID={`rsvp-yes-${e.event_id}`}>
              <Text style={styles.rsvpTxt}>{"I'll be there"}</Text>
            </Pressable>
            <Pressable onPress={() => onRsvp("maybe")} style={[styles.rsvpBtn, { backgroundColor: colors.warning }]} testID={`rsvp-maybe-${e.event_id}`}>
              <Text style={styles.rsvpTxt}>Maybe</Text>
            </Pressable>
            <Pressable onPress={() => onRsvp("no")} style={[styles.rsvpBtn, { backgroundColor: colors.error }]} testID={`rsvp-no-${e.event_id}`}>
              <Text style={styles.rsvpTxt}>{"Can't"}</Text>
            </Pressable>
          </View>
          {e.yes_list?.length > 0 ? (
            <View style={styles.listBox}>
              <Text style={styles.listLbl}>Confirmed sevaks</Text>
              {e.yes_list.map((r: any) => {
                const canManage = isOfficer || r.user_id === user?.user_id;
                return (
                  <View key={r.user_id} style={styles.rsvpItem}>
                    <Text style={styles.listItem}>
                      · {r.user_name} ({r.user_role}){r.plus_ones ? ` +${r.plus_ones}` : ""}
                    </Text>
                    {canManage ? (
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <Pressable onPress={() => onAdjustPlus(r.user_id, Math.max(0, (r.plus_ones || 0) - 1))} style={styles.tinyBtn} testID={`plus-dec-${e.event_id}-${r.user_id}`}>
                          <Text style={styles.tinyBtnTxt}>−</Text>
                        </Pressable>
                        <Pressable onPress={() => onAdjustPlus(r.user_id, (r.plus_ones || 0) + 1)} style={styles.tinyBtn} testID={`plus-inc-${e.event_id}-${r.user_id}`}>
                          <Text style={styles.tinyBtnTxt}>+</Text>
                        </Pressable>
                        <Pressable onPress={() => onRemove(r.user_id, r.user_name)} style={[styles.tinyBtn, styles.tinyBtnDanger]} testID={`rsvp-remove-${e.event_id}-${r.user_id}`}>
                          <Text style={[styles.tinyBtnTxt, { color: colors.onError }]}>✕</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}
          {isOfficer && (e.maybe_list?.length > 0 || e.no_list?.length > 0) ? (
            <View style={styles.listBox}>
              <Text style={styles.listLbl}>Not confirmed</Text>
              {[...(e.maybe_list || []), ...(e.no_list || [])].map((r: any) => (
                <View key={`${r.status}-${r.user_id}`} style={styles.rsvpItem}>
                  <Text style={styles.listItem}>{`· ${r.user_name} — ${r.status === "maybe" ? "maybe" : "can't come"}`}</Text>
                  <Pressable onPress={() => onRemove(r.user_id, r.user_name)} style={[styles.tinyBtn, styles.tinyBtnDanger]} testID={`rsvp-remove-${e.event_id}-${r.user_id}`}>
                    <Text style={[styles.tinyBtnTxt, { color: colors.onError }]}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: fonts.display, fontSize: 20, fontWeight: "600", color: colors.onSurface, marginBottom: spacing.md, marginTop: spacing.md },
  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  head: { flexDirection: "row", alignItems: "center" },
  title: { fontFamily: fonts.display, fontSize: 18, fontWeight: "600", color: colors.onSurface },
  date: { color: colors.muted, fontSize: 12, marginTop: 2 },
  count: { alignItems: "center", backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md, minWidth: 68 },
  countBig: { color: colors.brandPrimary, fontFamily: fonts.display, fontSize: 22, fontWeight: "700" },
  countLbl: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: "700" },
  pills: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  pillTxt: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: "600" },
  rsvpArea: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  rsvpLbl: { color: colors.onSurfaceTertiary, fontSize: 13, marginBottom: 8 },
  numBtn: { width: 44, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  rsvpBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.pill, alignItems: "center" },
  rsvpTxt: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  listBox: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  listLbl: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
  listItem: { color: colors.onSurfaceTertiary, fontSize: 12, flexShrink: 1 },
  rsvpItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, gap: spacing.sm },
  tinyBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  tinyBtnDanger: { backgroundColor: colors.error },
  tinyBtnTxt: { color: colors.onSurface, fontWeight: "800", fontSize: 14, lineHeight: 16 },
});
