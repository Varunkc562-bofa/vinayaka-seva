import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { API, getToken } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader } from "@/src/ui";

type Msg = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "Which tasks are overdue?",
  "How much did we spend on food?",
  "Who is responsible for decoration?",
  "Summarize today's committee activities.",
  "Show me the remaining festival budget.",
];

export default function SevaAI() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [messages]);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: question }, { role: "assistant", text: "" }]);
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question, session_id: sessionId }),
      });
      if (!res.body) {
        // Fallback: read as text
        const txt = await res.text();
        setMessages(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", text: txt || "…" }; return c; });
      } else {
        const reader = (res.body as any).getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() || "";
          for (const part of parts) {
            const line = part.replace(/^data:\s*/, "").trim();
            if (!line) continue;
            try {
              const evt = JSON.parse(line);
              if (evt.delta) setMessages(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", text: c[c.length - 1].text + evt.delta }; return c; });
              if (evt.session_id) setSessionId(evt.session_id);
              if (evt.error) setMessages(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", text: "Sorry, something went wrong." }; return c; });
            } catch {}
          }
        }
      }
    } catch (e) {
      setMessages(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", text: "Couldn't reach Seva AI. Please try again." }; return c; });
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <View testID="seva-ai-screen" style={{ flex: 1 }}>
        <ScreenHeader title="Seva AI" subtitle="Your festival assistant" back onBack={() => router.back()} />

        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
          {messages.length === 0 ? (
            <View>
              <View style={styles.welcome}>
                <Text style={styles.welcomeMantra}>ॐ</Text>
                <Text style={styles.welcomeTitle}>Namaste! I'm Seva AI</Text>
                <Text style={styles.welcomeBody}>Ask me anything about your committee — tasks, donations, volunteers, or events.</Text>
              </View>
              <Text style={styles.suggestLbl}>TRY ASKING</Text>
              {SUGGESTIONS.map(s => (
                <Pressable key={s} onPress={() => send(s)} style={styles.suggest} testID={`suggest-${s.slice(0, 10)}`}>
                  <Text style={styles.suggestText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : messages.map((m, i) => (
            <View key={i} style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.aiBubble]}>
              {m.role === "assistant" && <Text style={styles.aiTag}>SEVA AI</Text>}
              <Text style={[styles.bubbleText, m.role === "user" && { color: colors.onBrand }]}>
                {m.text || (busy && i === messages.length - 1 ? "•••" : "")}
              </Text>
            </View>
          ))}
          {busy && messages[messages.length - 1]?.role === "assistant" && !messages[messages.length - 1].text ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.md }} />
          ) : null}
        </ScrollView>

        <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Seva AI…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            onSubmitEditing={() => send(input)}
            testID="ai-input"
          />
          <Pressable onPress={() => send(input)} style={[styles.sendBtn, (!input.trim() || busy) && { opacity: 0.5 }]} disabled={!input.trim() || busy} testID="ai-send">
            <Text style={styles.sendTxt}>→</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  welcome: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.brandTertiary, borderRadius: radius.lg, marginBottom: spacing.xl, borderWidth: 1, borderColor: "rgba(230,81,0,0.15)" },
  welcomeMantra: { fontSize: 60, color: colors.brandPrimary, fontFamily: fonts.display, marginBottom: spacing.sm },
  welcomeTitle: { fontFamily: fonts.display, fontSize: 24, fontWeight: "600", color: colors.onSurface },
  welcomeBody: { color: colors.onSurfaceTertiary, textAlign: "center", marginTop: 6, fontSize: 14, lineHeight: 20 },
  suggestLbl: { color: colors.muted, fontSize: 11, letterSpacing: 1, fontWeight: "700", marginBottom: spacing.sm, marginLeft: spacing.sm },
  suggest: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  suggestText: { color: colors.onSurface, fontSize: 14 },
  bubble: { padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.sm, maxWidth: "88%" },
  userBubble: { backgroundColor: colors.brandPrimary, alignSelf: "flex-end", borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: colors.surfaceSecondary, alignSelf: "flex-start", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  aiTag: { color: colors.brandPrimary, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  bubbleText: { color: colors.onSurface, fontSize: 15, lineHeight: 22 },
  inputRow: { flexDirection: "row", padding: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, alignItems: "center" },
  input: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 12, color: colors.onSurface, fontSize: 15, borderWidth: 1, borderColor: colors.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  sendTxt: { color: colors.onBrand, fontSize: 22, fontWeight: "700" },
});
