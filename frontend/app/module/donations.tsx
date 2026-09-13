import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, BottomSheet, Field, Button, Empty, fmtINR } from "@/src/ui";

export default function Donations() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [donor, setDonor] = useState(""); const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash"); const [note, setNote] = useState("");
  const [phone, setPhone] = useState(""); const [sendSms, setSendSms] = useState(true);

  const { data: donations = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["donations"], queryFn: api.donations,
  });
  const total = useMemo(() => donations.reduce((s: number, d: any) => s + (d.amount || 0), 0), [donations]);
  const createM = useMutation({
    mutationFn: (d: any) => api.createDonation(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["donations"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); setShow(false); setDonor(""); setAmount(""); setNote(""); setPhone(""); },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="donations-screen">
      <ScreenHeader title="Donations" subtitle="Every rupee, remembered" back onBack={() => router.back()} right={
        <Pressable onPress={() => setShow(true)} style={styles.addBtn} testID="new-donation-button"><Text style={styles.addTxt}>+</Text></Pressable>
      } />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}>
        <View style={styles.hero}>
          <Text style={styles.heroLbl}>TOTAL COLLECTED</Text>
          <Text style={styles.heroVal}>{fmtINR(total)}</Text>
          <Text style={styles.heroMeta}>{donations.length} contributions · Ganpati Bappa Morya 🌼</Text>
        </View>
        {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> :
         donations.length === 0 ? <Empty title="No donations logged yet" body="Tap + to record your first contribution." testID="donations-empty" /> :
         donations.map((d: any) => (
          <View key={d.donation_id} style={styles.row}>
            <View style={styles.avatar}><Text style={styles.aTxt}>{d.donor_name?.slice(0, 1).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.donor}>{d.donor_name}</Text>
              <Text style={styles.meta}>{d.mode?.toUpperCase()} · {d.created_by} {d.note ? "· " + d.note : ""}</Text>
            </View>
            <Text style={styles.amt}>{fmtINR(d.amount)}</Text>
          </View>
        ))}
      </ScrollView>
      <BottomSheet visible={show} onClose={() => setShow(false)} title="Log a donation" testID="donation-sheet">
        <Field label="Donor name" value={donor} onChangeText={setDonor} placeholder="Ramesh Kulkarni" />
        <Field label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="1100" />
        <Text style={styles.optLbl}>Mode</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg }}>
          {["cash", "upi", "bank"].map(m => (
            <Pressable key={m} onPress={() => setMode(m)} testID={`mode-${m}`}
              style={{ flex: 1, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: mode === m ? colors.brandPrimary : colors.surfaceSecondary, borderWidth: 1, borderColor: mode === m ? colors.brandPrimary : colors.border, alignItems: "center" }}>
              <Text style={{ color: mode === m ? colors.onBrand : colors.onSurfaceTertiary, fontWeight: "700", textTransform: "uppercase", fontSize: 12 }}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Family donation" />
        <Field label="Donor phone (for SMS receipt)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+919876543210" autoCapitalize="none" />
        <Pressable onPress={() => setSendSms(!sendSms)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.lg }} testID="send-sms-toggle">
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: sendSms ? colors.brandPrimary : colors.borderStrong, backgroundColor: sendSms ? colors.brandPrimary : "transparent", alignItems: "center", justifyContent: "center" }}>
            {sendSms ? <Text style={{ color: colors.onBrand, fontWeight: "800" }}>✓</Text> : null}
          </View>
          <Text style={{ color: colors.onSurface, fontWeight: "600", fontSize: 14 }}>Send SMS thank-you to donor</Text>
        </Pressable>
        <Button label={createM.isPending ? "Saving…" : "Save donation"} disabled={createM.isPending || !donor.trim() || !amount}
          onPress={() => createM.mutate({ donor_name: donor.trim(), amount: parseFloat(amount) || 0, mode, note, phone: phone.trim() || null, send_sms: sendSms })} testID="save-donation-button" />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  addTxt: { color: colors.onBrand, fontSize: 26, lineHeight: 28, fontWeight: "300" },
  hero: { backgroundColor: colors.brandPrimary, borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.xl },
  heroLbl: { color: "rgba(255,255,255,0.7)", fontSize: 11, letterSpacing: 1, fontWeight: "700" },
  heroVal: { color: colors.onBrand, fontFamily: fonts.display, fontSize: 42, fontWeight: "700", marginTop: 6 },
  heroMeta: { color: colors.brandSecondary, fontSize: 13, marginTop: 6 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  aTxt: { color: colors.brandPrimary, fontWeight: "700", fontFamily: fonts.display },
  donor: { color: colors.onSurface, fontWeight: "600", fontSize: 15 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  amt: { color: colors.brandPrimary, fontFamily: fonts.display, fontSize: 18, fontWeight: "700" },
  optLbl: { fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: "600" },
});
