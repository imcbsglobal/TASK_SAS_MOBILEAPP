// import React, { useEffect, useState } from "react";
// import {
//   View,
//   Text,
//   FlatList,
//   StyleSheet,
//   ScrollView,
//   ActivityIndicator,
//   Alert,
//   TextInput,
// } from "react-native";
// import AsyncStorage from "@react-native-async-storage/async-storage";

// export default function DebtorsScreen() {
//   const [data, setData] = useState([]);
//   const [filteredData, setFilteredData] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [searchQuery, setSearchQuery] = useState("");

//   useEffect(() => {
//     const fetchDebtors = async () => {
//       try {
//         const token = await AsyncStorage.getItem("accessToken");
//         if (!token) {
//           Alert.alert("Error", "No token found. Please login again.");
//           setLoading(false);
//           return;
//         }

//         const response = await fetch("https://taskcloud.imcbs.com/api/get-debtors-data/", {
//           method: "GET",
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Bearer ${token}`,
//           },
//         });

//         if (response.status === 401) {
//           Alert.alert("Session Expired", "Please login again.");
//           setLoading(false);
//           return;
//         }

//         if (!response.ok) {
//           const errorData = await response.json();
//           Alert.alert("Error", errorData.detail || "Failed to fetch data");
//           setLoading(false);
//           return;
//         }

//         const result = await response.json();

//         // ✅ Format & calculate balance (debit - credit)
//         const formattedData = result
//           .map((item) => {
//             const debit = item.master_debit || 0;
//             const credit = item.master_credit || 0;
//             const balance = debit - credit;
//             return {
//               id: item.code,
//               name: item.name,
//               place: item.place || "-",
//               phone: item.phone2 || "-",
//               debit,
//               credit,
//               balance,
//             };
//           })
//           .filter((item) => item.balance > 0); // ✅ show only positive balances

//         setData(formattedData);
//         setFilteredData(formattedData);
//         setLoading(false);
//       } catch (error) {
//         console.error("Error fetching debtors:", error);
//         Alert.alert("Error", "Something went wrong while fetching data.");
//         setLoading(false);
//       }
//     };

//     fetchDebtors();
//   }, []);

//   // ✅ Filter data whenever searchQuery changes
//   useEffect(() => {
//     if (!searchQuery) {
//       setFilteredData(data);
//     } else {
//       const query = searchQuery.toLowerCase();
//       const filtered = data.filter(
//         (item) =>
//           item.name.toLowerCase().includes(query) ||
//           item.place.toLowerCase().includes(query) ||
//           item.phone.toLowerCase().includes(query)
//       );
//       setFilteredData(filtered);
//     }
//   }, [searchQuery, data]);

//   return (
//     <View style={styles.container}>
//       <Text style={styles.title}>Debtors Statement</Text>

//       {/* Search Bar */}
//       <TextInput
//         style={styles.searchInput}
//         placeholder="Search by Name, Place or Phone"
//         value={searchQuery}
//         onChangeText={setSearchQuery}
//       />

//       {loading ? (
//         <ActivityIndicator size="large" color="#0d6efd" style={{ marginTop: 20 }} />
//       ) : (
//         <ScrollView horizontal>
//           <View>
//             {/* Table Header */}
//             <View style={styles.headerRow}>
//               <Text style={[styles.headerCell, { flex: 2 }]}>DETAILS</Text>
//               <Text style={[styles.headerCell, { flex: 1 }]}>BALANCE</Text>
//             </View>

//             {/* Table Rows */}
//             <FlatList
//               data={filteredData}
//               keyExtractor={(item, index) => item.id?.toString() || index.toString()}
//               renderItem={({ item }) => (
//                 <View style={styles.row}>
//                   {/* DETAILS Column */}
//                   <View style={[styles.detailsCell, { flex: 2 }]}>
//                     <Text style={styles.name}>{item.name}</Text>
//                     <Text style={styles.subText}>{item.place}</Text>
//                     <Text style={styles.subText}>{item.phone}</Text>
//                   </View>

//                   {/* BALANCE Column */}
//                   <Text style={[styles.balanceCell, { flex: 1 }]}>
//                     {item.balance.toFixed(3)}
//                   </Text>
//                 </View>
//               )}
//             />
//           </View>
//         </ScrollView>
//       )}
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: "#fff", padding: 10 },
//   title: { fontSize: 20, fontWeight: "bold", textAlign: "center", marginBottom: 10 },
//   searchInput: {
//     borderWidth: 1,
//     borderColor: "#ddd",
//     borderRadius: 10,
//     padding: 10,
//     marginBottom: 10,
//     fontSize: 16,
//     backgroundColor: "#f8f8f8",
//   },
//   headerRow: {
//     flexDirection: "row",
//     backgroundColor: "#0d6efd",
//     paddingVertical: 8,
//     borderTopLeftRadius: 6,
//     borderTopRightRadius: 6,
//   },
//   headerCell: {
//     color: "#fff",
//     fontWeight: "bold",
//     textAlign: "center",
//     fontSize: 16,
//   },
//   row: {
//     flexDirection: "row",
//     borderBottomWidth: 1,
//     borderBottomColor: "#ddd",
//     paddingVertical: 8,
//     backgroundColor: "#fff",
//   },
//   detailsCell: {
//     paddingHorizontal: 8,
//   },
//   name: {
//     fontSize: 16,
//     fontWeight: "600",
//     color: "#1e293b",
//   },
//   subText: {
//     fontSize: 14,
//     color: "#475569",
//   },
//   balanceCell: {
//     textAlign: "center",
//     fontSize: 16,
//     fontWeight: "bold",
//     color: "#0d6efd",
//     alignSelf: "center",
//   },
// });
