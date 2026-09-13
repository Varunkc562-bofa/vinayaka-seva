import { Tabs } from "expo-router";
import { Text, View, StyleSheet } from "react-native";
import { colors, fonts } from "@/src/theme";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={styles.tab}>
      <Text style={[styles.dot, { color: focused ? colors.brandPrimary : "transparent" }]}>●</Text>
      <Text style={[styles.label, { color: focused ? colors.brandPrimary : colors.muted, fontWeight: focused ? "700" : "500" }]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingTop: 8,
        },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen name="home" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} /> }} />
      <Tabs.Screen name="tasks" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Tasks" focused={focused} /> }} />
      <Tabs.Screen name="community" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Community" focused={focused} /> }} />
      <Tabs.Screen name="more" options={{ tabBarIcon: ({ focused }) => <TabIcon label="More" focused={focused} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tab: { alignItems: "center", justifyContent: "center", minWidth: 60 },
  dot: { fontSize: 8, marginBottom: 2 },
  label: { fontSize: 12, fontFamily: fonts.text, letterSpacing: 0.3 },
});
