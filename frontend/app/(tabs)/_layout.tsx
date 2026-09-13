import { Tabs } from "expo-router";
import { Text, View, StyleSheet, Platform } from "react-native";
import { colors, fonts } from "@/src/theme";

function TabIcon({ focused, glyph }: { focused: boolean; glyph: string }) {
  return (
    <View style={styles.tab}>
      <Text style={[styles.glyph, { color: focused ? colors.brandPrimary : colors.muted }]}>{glyph}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: fonts.text,
          fontWeight: "600",
          letterSpacing: 0.3,
        },
        // Do NOT set height/paddingTop/paddingBottom on native — the navigator
        // sizes the bar as 49 + safe-area bottom on its own. Only give web
        // a plain number height because there's no auto safe-area on web.
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen name="home" options={{ tabBarLabel: "Home",
        tabBarIcon: ({ focused }) => <TabIcon focused={focused} glyph="◉" /> }} />
      <Tabs.Screen name="tasks" options={{ tabBarLabel: "Tasks",
        tabBarIcon: ({ focused }) => <TabIcon focused={focused} glyph="✓" /> }} />
      <Tabs.Screen name="community" options={{ tabBarLabel: "Community",
        tabBarIcon: ({ focused }) => <TabIcon focused={focused} glyph="✦" /> }} />
      <Tabs.Screen name="more" options={{ tabBarLabel: "More",
        tabBarIcon: ({ focused }) => <TabIcon focused={focused} glyph="≡" /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tab: { alignItems: "center", justifyContent: "center", minWidth: 60 },
  glyph: { fontSize: 20, fontFamily: fonts.display, lineHeight: 24 },
});
