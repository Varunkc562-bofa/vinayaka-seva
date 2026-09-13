import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, BottomSheet, Field, Button, Empty } from "@/src/ui";

export default function Polls() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [q, setQ] = useState(""); const [opts, setOpts] = useState<string[]>(["", ""]);
  const [anon, setAnon] = useState(false);

  const { data = [], isLoading, refetch, isRefetching } = useQuery({ queryKey: ["polls"], queryFn: api.polls });
  const createM = useMutation({
    mutationFn: (d: any) => api.createPoll(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["polls"] }); setShow(false); setQ(""); setOpts(["", ""]); setAnon(false); },
  });
  const voteM = useMutation({
    mutationFn: ({ id, idx }: any) => api.vote(id, idx),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["polls"] }),
  });
  const closeM = useMutation({
    mutationFn: (id: string) => api.closePoll(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["polls"] }),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="polls-screen">
      <ScreenHeader title="Committee Decisions" subtitle="Polls with a paper trail" back onBack={() => router.back()}
        right={<Pressable onPress={() => setShow(true)} style={styles.addBtn} testID="new-poll-button"><Text style={styles.addTxt}>+</Text></Pressable>} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}>
        {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> :
         data.length === 0 ? <Empty title="No decisions yet" body="Tap + to start a committee poll." testID="polls-empty" /> :
         data.map((p: any) => <PollCard key={p.poll_id} p={p} onVote={(idx) => voteM.mutate({ id: p.poll_id, idx })} onClose={() => closeM.mutate(p.poll_id)} />)}
      </ScrollView>
      <BottomSheet visible={show} onClose={() => setShow(false)} title="Start a poll" testID="poll-sheet">
        <Field label="Question" value={q} onChangeText={setQ} placeholder="Where should we hold the aarti?" />
        <Text style={{ fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: "600" }}>Options</Text>
        {opts.map((o, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <TextInput value={o} onChangeText={(v) => setOpts(opts.map((x, j) => i === j ? v : x))}
              placeholder={`Option ${i + 1}`} placeholderTextColor={colors.muted}
              style={{ flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12, fontSize: 15, color: colors.onSurface, borderWidth: 1, borderColor: colors.border }}
              testID={`poll-opt-${i}`} />
            {opts.length > 2 ? (
              <Pressable onPress={() => setOpts(opts.filter((_, j) => j !== i))} style={{ marginLeft: 8, padding: 8 }} testID={`poll-opt-del-${i}`}>
                <Text style={{ color: colors.error, fontSize: 20 }}>×</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        <Pressable onPress={() => setOpts([...opts, ""])} style={styles.addOpt} testID="poll-add-opt">
          <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>+ Add option</Text>
        </Pressable>
        <Pressable onPress={() => setAnon(!anon)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.lg }} testID="anon-toggle">
          <View style={[styles.cb, anon && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
            {anon ? <Text style={{ color: colors.onBrand, fontWeight: "800" }}>✓</Text> : null}
          </View>
          <Text style={{ color: colors.onSurface }}>Anonymous voting (hide voters)</Text>
        </Pressable>
        <Button label={createM.isPending ? "Creating…" : "Create poll"}
          disabled={createM.isPending || !q.trim() || opts.filter(o => o.trim()).length < 2}
          onPress={() => createM.mutate({ question: q, options: opts.map(o => o.trim()).filter(Boolean), anonymous: anon })}
          testID="save-poll-button" />
      </BottomSheet>
    </View>
  );
}

function PollCard({ p, onVote, onClose }: any) {
  const total = p.total_votes || 0;
  const isClosed = p.status !== "open";
  return (
    <View style={[styles.card, isClosed && { opacity: 0.85 }]}>
      <View style={styles.pRow}>
        <View style={[styles.status, { backgroundColor: isClosed ? colors.surfaceTertiary : colors.brandTertiary }]}>
          <Text style={[styles.statusTxt, { color: isClosed ? colors.muted : colors.brandPrimary }]}>{isClosed ? "CLOSED" : "OPEN"}</Text>
        </View>
        {p.anonymous ? <Text style={styles.anonTag}>🕊 anonymous</Text> : null}
      </View>
      <Text style={styles.q}>{p.question}</Text>
      <Text style={styles.by}>by {p.created_by_name} · {p.created_by_role}</Text>
      <View style={{ marginTop: spacing.md }}>
        {(p.options || []).map((opt: string, idx: number) => {
          const c = p.counts?.[idx] || 0;
          const pct = total > 0 ? Math.round((c / total) * 100) : 0;
          const mine = p.my_vote === idx;
          return (
            <Pressable key={idx} onPress={() => !isClosed && onVote(idx)} disabled={isClosed} style={styles.opt} testID={`poll-vote-${p.poll_id}-${idx}`}>
              <View style={[styles.optBar, { width: `${pct}%`, backgroundColor: mine ? colors.brandPrimary : colors.brandTertiary }]} />
              <View style={styles.optRow}>
                <Text style={[styles.optLbl, mine && { color: colors.onBrand, fontWeight: "700" }]}>{opt}</Text>
                <Text style={[styles.optCount, mine && { color: colors.onBrand }]}>{c} · {pct}%</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {!p.anonymous && (p.voters || []).length > 0 ? (
        <View style={styles.voters}>
          <Text style={styles.votersLbl}>Voters</Text>
          {p.voters.map((v: any, i: number) => (
            <Text key={i} style={styles.voter}>· {v.user_name} ({v.user_role}) → {p.options[v.option_index]}</Text>
          ))}
        </View>
      ) : null}
      {!isClosed ? (
        <Pressable onPress={onClose} style={styles.closeBtn} testID={`close-poll-${p.poll_id}`}>
          <Text style={styles.closeTxt}>Close poll</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  addTxt: { color: colors.onBrand, fontSize: 26, lineHeight: 28, fontWeight: "300" },
  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  pRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  status: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  statusTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  anonTag: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  q: { fontFamily: fonts.display, fontSize: 20, fontWeight: "600", color: colors.onSurface, marginTop: 6 },
  by: { color: colors.muted, fontSize: 12, marginTop: 2 },
  opt: { position: "relative", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, marginBottom: 8, overflow: "hidden", minHeight: 44, justifyContent: "center" },
  optBar: { position: "absolute", left: 0, top: 0, bottom: 0 },
  optRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: 10 },
  optLbl: { color: colors.onSurface, fontSize: 15, flex: 1 },
  optCount: { color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: "700" },
  voters: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  votersLbl: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
  voter: { color: colors.onSurfaceTertiary, fontSize: 12, marginBottom: 2 },
  closeBtn: { alignSelf: "flex-start", marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.error },
  closeTxt: { color: colors.error, fontWeight: "700", fontSize: 12 },
  addOpt: { paddingVertical: 12, alignItems: "center", marginBottom: spacing.md },
  cb: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
});
