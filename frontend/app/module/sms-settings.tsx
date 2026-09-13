import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, Field, Button } from "@/src/ui";

export default function SmsSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canManage = ["President", "Treasurer", "Secretary"].includes(user?.role || "");

  const { data, isLoading } = useQuery({ queryKey: ["smsConfig"], queryFn: api.getSmsConfig, enabled: canManage });
  const [state, setState] = useState<any>({
    enabled: false, provider: "twilio",
    committee_name: "Hanuman youth",
    template: "🙏 Namaste {donor}! {committee} received your kind contribution of ₹{amount}. Ganpati Bappa Morya!",
    twilio_sid: "", twilio_token: "", twilio_from: "",
    msg91_authkey: "", msg91_sender: "",
  });
  const [testPhone, setTestPhone] = useState("");
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => { if (data) setState((s: any) => ({ ...s, ...data, twilio_token: "", msg91_authkey: "" })); }, [data]);

  const saveM = useMutation({
    mutationFn: (d: any) => api.setSmsConfig(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smsConfig"] }),
  });
  const testM = useMutation({
    mutationFn: (phone: string) => api.testSms(phone),
    onSuccess: (r) => setTestResult(r),
  });

  if (!canManage) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader title="SMS Settings" back onBack={() => router.back()} />
        <View style={{ padding: spacing.xl }}>
          <Text style={{ color: colors.muted }}>Only the President, Treasurer or Secretary can manage SMS settings.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="sms-settings-screen">
      <ScreenHeader title="SMS Thank-You" subtitle="Warm donor receipts" back onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }} keyboardShouldPersistTaps="handled">
        {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Enable SMS receipts</Text>
            <Switch value={!!state.enabled} onValueChange={(v) => setState({ ...state, enabled: v })}
              trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }}
              thumbColor={colors.surface} testID="sms-enable-toggle" />
          </View>
          <Text style={styles.hint}>When on, donors with a phone number get an instant thank-you SMS.</Text>
        </View>

        <Text style={styles.section}>Message</Text>
        <View style={styles.card}>
          <Field label="Committee name" value={state.committee_name} onChangeText={(v: string) => setState({ ...state, committee_name: v })} testID="committee-name" />
          <Field label="SMS template" value={state.template} onChangeText={(v: string) => setState({ ...state, template: v })} multiline numberOfLines={4} testID="sms-template" />
          <Text style={styles.hint}>Placeholders: <Text style={styles.mono}>{"{donor}"}</Text>, <Text style={styles.mono}>{"{amount}"}</Text>, <Text style={styles.mono}>{"{committee}"}</Text></Text>
        </View>

        <Text style={styles.section}>Provider</Text>
        <View style={styles.tabsRow}>
          {["twilio", "msg91"].map((p) => (
            <Pressable key={p} onPress={() => setState({ ...state, provider: p })} testID={`provider-${p}`}
              style={[styles.tab, state.provider === p && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
              <Text style={{ color: state.provider === p ? colors.onBrand : colors.onSurfaceTertiary, fontWeight: "700" }}>{p.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        {state.provider === "twilio" ? (
          <View style={styles.card}>
            <Field label="Account SID" value={state.twilio_sid} onChangeText={(v: string) => setState({ ...state, twilio_sid: v })} autoCapitalize="none" testID="twilio-sid" />
            <Field label={data?.twilio_token_set ? "Auth token (leave blank to keep saved)" : "Auth token"} value={state.twilio_token} onChangeText={(v: string) => setState({ ...state, twilio_token: v })} secureTextEntry autoCapitalize="none" testID="twilio-token" />
            <Field label="From number (E.164, e.g. +14155551234)" value={state.twilio_from} onChangeText={(v: string) => setState({ ...state, twilio_from: v })} autoCapitalize="none" testID="twilio-from" />
          </View>
        ) : (
          <View style={styles.card}>
            <Field label={data?.msg91_authkey_set ? "Auth Key (leave blank to keep saved)" : "Auth Key"} value={state.msg91_authkey} onChangeText={(v: string) => setState({ ...state, msg91_authkey: v })} secureTextEntry autoCapitalize="none" testID="msg91-key" />
            <Field label="Sender ID (6 chars, e.g. HNMNYT)" value={state.msg91_sender} onChangeText={(v: string) => setState({ ...state, msg91_sender: v })} autoCapitalize="characters" testID="msg91-sender" />
          </View>
        )}

        <Button label={saveM.isPending ? "Saving…" : "Save settings"} onPress={() => saveM.mutate(state)} disabled={saveM.isPending} testID="save-sms-button" />
        {saveM.isSuccess ? <Text style={styles.ok}>✓ Saved</Text> : null}

        <Text style={styles.section}>Send a test SMS</Text>
        <View style={styles.card}>
          <Field label="Phone (E.164)" value={testPhone} onChangeText={setTestPhone} placeholder="+919876543210" keyboardType="phone-pad" autoCapitalize="none" testID="test-phone" />
          <Button label={testM.isPending ? "Sending…" : "Send test"} tone="gold" onPress={() => testPhone && testM.mutate(testPhone)} disabled={testM.isPending || !testPhone.trim()} testID="test-sms-button" />
          {testResult ? (
            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.label}>Status: <Text style={{ color: testResult.status === "sent" ? colors.success : colors.warning }}>{testResult.status}</Text></Text>
              {testResult.reason ? <Text style={styles.hint}>Reason: {testResult.reason}</Text> : null}
              {testResult.response ? <Text style={styles.mono}>{String(testResult.response).slice(0, 200)}</Text> : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  hint: { color: colors.muted, fontSize: 12, marginTop: 6 },
  section: { fontFamily: fonts.display, fontSize: 18, fontWeight: "600", color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.sm },
  tabsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  tab: { flex: 1, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  mono: { fontFamily: "monospace", color: colors.brandPrimary, fontSize: 12 },
  ok: { color: colors.success, marginTop: 8, fontWeight: "700" },
});
