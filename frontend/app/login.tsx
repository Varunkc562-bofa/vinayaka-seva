import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { useAuth } from "@/src/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1662031225146-42e30158e800?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHwyfHxMb3JkJTIwR2FuZXNoYSUyMGlkb2wlMjBmZXN0aXZhbHxlbnwwfHx8fDE3ODkyODM4NjJ8MA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);

  const onSignIn = async () => {
    setBusy(true);
    try { await signIn(); } finally { setBusy(false); }
  };

  return (
    <View style={styles.root} testID="login-screen">
      <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(43,34,30,0.15)", "rgba(43,34,30,0.55)", "rgba(43,34,30,0.95)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <Text style={styles.mantra}>|| Om Gan Ganapataye Namah ||</Text>
        <Text style={styles.brand}>Vinayaka</Text>
        <Text style={styles.brand2}>Seva</Text>
        <Text style={styles.tag}>A gentle way to run your Ganesh Chaturthi committee — donations, tasks, volunteers & prasadam, all in one place.</Text>

        <Pressable style={styles.cta} onPress={onSignIn} disabled={busy} testID="login-google-button">
          {busy ? <ActivityIndicator color={colors.onBrand} />
                : <Text style={styles.ctaText}>Continue with Google</Text>}
        </Pressable>
        <Text style={styles.footer}>Ganpati Bappa Morya 🌼</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#2B221E" },
  content: { flex: 1, justifyContent: "flex-end", padding: spacing.xl, paddingBottom: spacing["3xl"] },
  mantra: { color: colors.brandSecondary, fontFamily: fonts.display, fontSize: 14, letterSpacing: 2, marginBottom: spacing.sm },
  brand: { color: "#FFFFFF", fontFamily: fonts.display, fontSize: 64, lineHeight: 68, fontWeight: "600" },
  brand2: { color: colors.brandSecondary, fontFamily: fonts.display, fontSize: 64, lineHeight: 68, fontWeight: "600", marginBottom: spacing.lg },
  tag: { color: "rgba(255,255,255,0.85)", fontSize: 15, lineHeight: 22, marginBottom: spacing["2xl"] },
  cta: { backgroundColor: colors.brandPrimary, paddingVertical: 18, borderRadius: radius.pill, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  ctaText: { color: colors.onBrand, fontSize: 17, fontWeight: "700", letterSpacing: 0.3 },
  footer: { color: colors.brandSecondary, textAlign: "center", marginTop: spacing.xl, fontFamily: fonts.display, fontSize: 15, letterSpacing: 1 },
});
