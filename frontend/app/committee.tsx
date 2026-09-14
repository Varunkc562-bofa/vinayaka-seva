import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, Clipboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { Field, Button } from "@/src/ui";

export default function CommitteeOnboarding() {
  const insets = useSafeAreaInsets();
  const { refresh, signOut } = useAuth();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [created, setCreated] = useState<{ code: string; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const createM = useMutation({
    mutationFn: () => api.createCommittee(name.trim()),
    onSuccess: async (r: any) => {
      setCreated({ code: r.code, name: r.name });
      setErr(null);
      await refresh();
    },
    onError: (e: any) => setErr(e?.message || "Could not create committee"),
  });
  const joinM = useMutation({
    mutationFn: () => api.joinCommittee(code.trim().toUpperCase()),
    onSuccess: async () => { setErr(null); await refresh(); },
    onError: (e: any) => setErr(/404/.test(e?.message || "") ? "Committee code not found." : (e?.message || "Could not join")),
  });

  const copy = () => {
    if (!created) return;
    if (Platform.OS === "web" && typeof navigator !== "undefined" && (navigator as any).clipboard) {
      (navigator as any).clipboard.writeText(created.code);
    } else if ((Clipboard as any)?.setString) {
      (Clipboard as any).setString(created.code);
    }
  };

  if (created) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }} testID="committee-created-screen">
        <LinearGradient colors={[colors.surfaceInverse, colors.info]} style={[styles.hero, { paddingTop: insets.top + spacing["2xl"] }]}>
          <Text style={styles.heroMantra}>|| Ganpati Bappa Morya ||</Text>
          <Text style={styles.heroTitle}>{created.name}</Text>
          <Text style={styles.heroSub}>Your committee is ready</Text>
        </LinearGradient>
        <View style={{ padding: spacing.xl, alignItems: "center" }}>
          <Text style={styles.codeLbl}>SHARE THIS CODE WITH YOUR MEMBERS</Text>
          <Pressable onPress={copy} style={styles.codeBox} testID="copy-code-button">
            <Text style={styles.codeText}>{created.code}</Text>
            <Text style={styles.tapCopy}>Tap to copy</Text>
          </Pressable>
          <Text style={styles.hint}>Everyone who enters this code on their phone joins your committee and sees the same live data.</Text>
          <Button label="Go to my dashboard" onPress={refresh} style={{ marginTop: spacing.xl, alignSelf: "stretch" }} testID="continue-to-app" />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="committee-screen">
      <LinearGradient colors={[colors.surfaceInverse, colors.info]} style={[styles.hero, { paddingTop: insets.top + spacing["2xl"] }]}>
        <Text style={styles.heroMantra}>|| Om Gan Ganapataye Namah ||</Text>
        <Text style={styles.heroTitle}>Join or start a committee</Text>
        <Text style={styles.heroSub}>Your data is private to your committee</Text>
      </LinearGradient>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}>
        <View style={styles.tabRow}>
          <Pressable onPress={() => setTab("create")} style={[styles.tab, tab === "create" && styles.tabOn]} testID="tab-create">
            <Text style={[styles.tabTxt, tab === "create" && styles.tabTxtOn]}>Create new</Text>
          </Pressable>
          <Pressable onPress={() => setTab("join")} style={[styles.tab, tab === "join" && styles.tabOn]} testID="tab-join">
            <Text style={[styles.tabTxt, tab === "join" && styles.tabTxtOn]}>Join with code</Text>
          </Pressable>
        </View>

        {tab === "create" ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Start a new committee</Text>
            <Text style={styles.cardSub}>You'll be the President. Others join with the code we'll show you.</Text>
            <Field label="Committee name" value={name} onChangeText={setName} placeholder="e.g. Hanuman Youth Committee" testID="committee-name-input" />
            <Button label={createM.isPending ? "Creating…" : "Create committee"} onPress={() => name.trim() && createM.mutate()} disabled={createM.isPending || !name.trim()} testID="create-committee-button" />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Join an existing committee</Text>
            <Text style={styles.cardSub}>Ask your President for the 6-character committee code.</Text>
            <Field label="Committee code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="H4K9M2" autoCapitalize="characters" maxLength={6} testID="committee-code-input" />
            <Button label={joinM.isPending ? "Joining…" : "Join committee"} onPress={() => code.trim() && joinM.mutate()} disabled={joinM.isPending || code.trim().length < 6} testID="join-committee-button" />
          </View>
        )}
        {err ? <Text style={styles.err}>{err}</Text> : null}

        <Pressable onPress={signOut} style={styles.signOut} testID="onboard-signout">
          <Text style={styles.signOutTxt}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { padding: spacing.xl, paddingBottom: spacing["2xl"] },
  heroMantra: { color: colors.brandSecondary, fontFamily: fonts.display, fontSize: 13, letterSpacing: 2 },
  heroTitle: { color: "#FFFFFF", fontFamily: fonts.display, fontSize: 32, fontWeight: "600", marginTop: 6 },
  heroSub: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 4 },
  tabRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  tab: { flex: 1, paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, alignItems: "center" },
  tabOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabTxt: { color: colors.onSurfaceTertiary, fontWeight: "700" },
  tabTxtOn: { color: colors.onBrand },
  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  cardTitle: { fontFamily: fonts.display, fontSize: 20, fontWeight: "600", color: colors.onSurface },
  cardSub: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: spacing.md, lineHeight: 18 },
  err: { color: colors.error, textAlign: "center", marginTop: spacing.md, fontWeight: "600" },
  codeLbl: { color: colors.muted, fontSize: 11, letterSpacing: 1, fontWeight: "700", marginTop: spacing.md, marginBottom: spacing.sm },
  codeBox: { backgroundColor: colors.brandTertiary, borderWidth: 2, borderColor: colors.brandPrimary, borderRadius: radius.lg, paddingHorizontal: spacing["2xl"], paddingVertical: spacing.lg, alignItems: "center", marginBottom: spacing.md },
  codeText: { color: colors.brandPrimary, fontFamily: fonts.display, fontSize: 44, fontWeight: "700", letterSpacing: 8 },
  tapCopy: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 1, fontWeight: "700", marginTop: 4 },
  hint: { color: colors.onSurfaceTertiary, fontSize: 13, textAlign: "center", lineHeight: 20 },
  signOut: { marginTop: spacing.xl, paddingVertical: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center" },
  signOutTxt: { color: colors.muted, fontWeight: "700" },
});
