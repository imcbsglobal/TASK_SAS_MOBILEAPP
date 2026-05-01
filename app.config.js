module.exports = {
  expo: {
    name: "TaskSAS",
    slug: "TaskSAS1",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/app-icon.png",
    scheme: "tasksas",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
   ios: {
  supportsTablet: true,
  backgroundColor: "#ffffff",
  bundleIdentifier: "imcbs.TaskSAS",
  infoPlist: {
    UIViewControllerBasedStatusBarAppearance: true,
    UIStatusBarStyle: "UIStatusBarStyleLightContent",

    NSBluetoothAlwaysUsageDescription:
      "This app uses Bluetooth to connect to nearby printers and print receipts.",

    NSBluetoothPeripheralUsageDescription:
      "This app uses Bluetooth to communicate with external printer devices."
  }
},
    android: {
      package: "com.imcbs.TaskSAS",
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      intentFilters: [
        {
          action: "VIEW",
          data: [
            {
              scheme: "tasksas"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ],
      permissions: [
        "android.permission.CAMERA",
        "android.permission.READ_PHONE_STATE",
        "android.permission.BLUETOOTH",
        "android.permission.BLUETOOTH_ADMIN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION"
      ]
    },

    web: {
      favicon: "./assets/images/app-icon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash.png",
          imageWidth: 300,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            image: "./assets/images/splash.png",
            backgroundColor: "#1a1a1a"
          }
        }
      ],
      "expo-sqlite",
      "expo-file-system",

    ],
    extra: {
      eas: {
        "projectId": "c0dd53fe-8624-4c0f-aa1a-851f1c3b14fb"
      }
    },
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    }
  }
};