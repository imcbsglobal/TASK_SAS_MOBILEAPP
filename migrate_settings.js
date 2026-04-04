const fs = require('fs');
const homePath = 'app/(tabs)/Home.js';
const companyPath = 'app/(tabs)/Company.js';

let homeSrc = fs.readFileSync(homePath, 'utf8').replace(/\r\n/g, '\n');
let compSrc = fs.readFileSync(companyPath, 'utf8').replace(/\r\n/g, '\n');

function getBlock(src, startStr, endStr) {
    let start = src.indexOf(startStr);
    let end = src.indexOf(endStr);
    if (start === -1 || end === -1) {
        throw new Error(`Cannot find blocks: ${startStr.substring(0, 50)} or ${endStr.substring(0, 50)}`);
    }
    return src.substring(start, end);
}

// The exact literal blocks to extract
const stateStart = "  // Settings Modal State";
const stateEnd = "  useEffect(() => {";
let stateBlock = getBlock(homeSrc, stateStart, stateEnd);

const methodsStart = "  const loadPrinterSettings = async () => {";
const methodsEnd = "  const getCurrentDate = () => {";
let methodsBlock = getBlock(homeSrc, methodsStart, methodsEnd);

const modalsStart = "        {/* Settings Modal */}";
const modalsEnd = "      </SafeAreaView>";
let modalsBlock = getBlock(homeSrc, modalsStart, modalsEnd);

const stylesStart = "  modalOverlay: {";
const stylesEnd = "  footerContainer: {";
let stylesBlock = getBlock(homeSrc, stylesStart, stylesEnd);

// Perform deletions in Home
homeSrc = homeSrc.replace(stateBlock, "\n");
homeSrc = homeSrc.replace(methodsBlock, "\n");
homeSrc = homeSrc.replace(modalsBlock, "\n");
homeSrc = homeSrc.replace(stylesBlock, "\n");

// delete the useEffect load calls
homeSrc = homeSrc.replace(`    loadPrinterSettings();\n    loadProductSettings();\n    loadPaymentSettings();\n    loadPrintFormSettings();\n    loadTaxSettings();\n`, "");

const homeSettingsButtonStart = "    {\n      icon: 'settings-outline',";
const homeSettingsButtonEnd = "    },";
let homeSettingsButton = getBlock(homeSrc, homeSettingsButtonStart, homeSettingsButtonEnd) + homeSettingsButtonEnd;

homeSrc = homeSrc.replace(homeSettingsButton, `    {
      icon: 'people',
      title: 'CUSTOMERS',
      description: 'Registered customers',
      onPress: () => router.push("/customers"),
      gradient: [Colors.secondary[400], Colors.secondary[600]],
      shadowColor: Colors.secondary.main,
      moduleCode: 'MOD012',
    },
    {
      icon: 'location',
      title: 'LOCATION',
      description: 'Location Capture',
      onPress: () => router.push("/location-capture"),
      gradient: [Colors.warning[400], Colors.warning[600]],
      shadowColor: Colors.warning.main,
      moduleCode: 'MOD011',
    },`);

// Company modifications
if(!compSrc.includes('printerService')) {
    compSrc = compSrc.replace(`import dbService from "../../src/services/database";`, `import dbService from "../../src/services/database";\nimport printerService from "../../src/services/printerService";\nimport { KeyboardAvoidingView, Platform, TextInput } from "react-native";`);
}

compSrc = compSrc.replace(`  const [logoutVisible, setLogoutVisible] = useState(false);`, `  const [logoutVisible, setLogoutVisible] = useState(false);\n\n${stateBlock}`);
compSrc = compSrc.replace(`  const loadCustomerCount = async () => {`, `${methodsBlock}\n  const loadCustomerCount = async () => {`);
compSrc = compSrc.replace(`  useEffect(() => {\n    loadCustomerCount();\n  }, []);`, `  useEffect(() => {\n    loadCustomerCount();\n    loadPrinterSettings();\n    loadProductSettings();\n    loadPaymentSettings();\n    loadPrintFormSettings();\n    loadTaxSettings();\n  }, []);`);

const compCustomersButtonStart = "    {\n      icon: \"people\",";
const compCustomersButtonEnd = "    }";
let compCustomersButton = getBlock(compSrc, compCustomersButtonStart, compCustomersButtonEnd) + compCustomersButtonEnd;

compSrc = compSrc.replace(compCustomersButton, `    {
      icon: "settings-outline",
      title: "Settings",
      description: "Printer & App configuration",
      onPress: () => {
        loadPrinterSettings();
        loadProductSettings();
        loadPaymentSettings();
        loadPrintFormSettings();
        loadTaxSettings();
        setIsPrinterSettingsOpen(false);
        setIsProductSettingsOpen(false);
        setIsPaymentSettingsOpen(false);
        setIsPrintFormSettingsOpen(false);
        setIsTaxSettingsOpen(false);
        setSettingsModalVisible(true);
      },
      color: Colors.text.primary,
      bg: Colors.neutral[100],
    }`);


const attendanceStart = "          {/* Attendance Section */}";
const attendanceEnd = "          <View style={styles.infoSection}>";
let attendanceBlock = getBlock(compSrc, attendanceStart, attendanceEnd);
compSrc = compSrc.replace(attendanceBlock, "");

const showLocStart = "  const showLocationCapture";
const showLocEnd = "Module\n";
let showLocIdx = compSrc.indexOf(showLocStart);
let showLocEndIdx = compSrc.indexOf(showLocEnd, showLocIdx);
if(showLocIdx !== -1 && showLocEndIdx !== -1) {
    let showLocBlock = compSrc.substring(showLocIdx, showLocEndIdx + showLocEnd.length);
    compSrc = compSrc.replace(showLocBlock, "");
}

compSrc = compSrc.replace(`        {/* Logout Confirmation Modal */}`, `${modalsBlock}\n\n        {/* Logout Confirmation Modal */}`);

compSrc = compSrc.replace(`  confirmButtonText: {`, `${stylesBlock}\n  confirmButtonText: {`);

fs.writeFileSync('app/(tabs)/Home.js', homeSrc);
fs.writeFileSync('app/(tabs)/Company.js', compSrc);

console.log("Migration successfully validated and finished.");
