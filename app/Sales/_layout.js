import { Stack } from "expo-router";

export default function SalesLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="PlaceSales" />
            <Stack.Screen name="SalesEntry" />
            <Stack.Screen name="SalesDetails" />
            <Stack.Screen name="SalesScanner" />
        </Stack>
    );
}
