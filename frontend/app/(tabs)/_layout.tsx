import { Tabs } from "expo-router";
import { Text, View, StyleSheet, Platform } from "react-native";
import { colors, fonts } from "@/src/theme";

function TabIcon({ label, focused, glyph }: { label: string; focused: boolean; glyph: string }) {
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
        tabBarLabelStyle: { fontSize: 11, fontFamily: fonts.text, fontWeight: "600", letterSpacing: 0.3, marginTop: -2 },
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingTop: 6,
          ...(Platform.OS === "web" ? { height: 68 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center", paddingVertical: 4 },
      }}
    >
      <Tabs.Screen name="home" options={{ tabBarLabel: "Home",
        tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} glyph="◉" /> }} />
      <Tabs.Screen name="tasks" options={{ tabBarLabel: "Tasks",
        tabBarIcon: ({ focused }) => <TabIcon label="Tasks" focused={focused} glyph="✓" /> }} />
      <Tabs.Screen name="community" options={{ tabBarLabel: "Community",
        tabBarIcon: ({ focused }) => <TabIcon label="Community" focused={focused} glyph="✦" /> }} />
      <Tabs.Screen name="more" options={{ tabBarLabel: "More",
        tabBarIcon: ({ focused }) => <TabIcon label="More" focused={focused} glyph="≡" /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tab: { alignItems: "center", justifyContent: "center", minWidth: 60, height: 26 },
  glyph: { fontSize: 22, fontFamily: fonts.display, lineHeight: 26 },
});
