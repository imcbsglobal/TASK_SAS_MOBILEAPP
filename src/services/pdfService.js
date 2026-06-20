
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

let memoryCompanyInfo = null;

const pdfService = {
  /**
   * Helper to fetch company info from cache/storage or API
   */
  fetchCompanyInfo: async () => {
    if (memoryCompanyInfo) return memoryCompanyInfo;
    try {
      // 1. Try Local Cache
      const cached = await AsyncStorage.getItem('printer_company_info');
      if (cached) {
        memoryCompanyInfo = JSON.parse(cached);
        return memoryCompanyInfo;
      }

      // 2. Fetch from API if cache misses
      const [token, clientId] = await Promise.all([
        AsyncStorage.getItem('authToken'),
        AsyncStorage.getItem('client_id')
      ]);

      if (token && clientId) {
        console.log('[pdfService] Fetching company info from API...');
        const API_URL = 'https://tasksas.com/api/get-misel-data/';
        const res = await fetch(`${API_URL}?client_id=${clientId}`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const json = await res.json();
          let info = null;
          if (Array.isArray(json.data) && json.data.length > 0) {
            info = json.data[0];
          } else if (typeof json.data === 'object') {
            info = json.data;
          }

          if (info) {
            memoryCompanyInfo = info;
            // Cache it for next time (shared with printer service)
            await AsyncStorage.setItem('printer_company_info', JSON.stringify(info));
            return info;
          }
        }
      }

      return null;
    } catch (e) {
      console.warn("PDF Company Fetch Error:", e);
      return null;
    }
  },

  /**
   * Generates HTML for the order receipt
   * @param {Object} order 
   * @param {Object} companyInfo
   * @returns {String} HTML string
   */
  generateOrderHTML: (order, companyInfo) => {
    console.log('PDF Items:', JSON.stringify(order.items, null, 2));

    // Format date
    const date = new Date(order.timestamp).toLocaleString();

    // Calculate totals
    const totalAmount = order.total.toFixed(2);

    // Company Details Logic
    const companyName = companyInfo?.firm_name || "TaskSAS";

    let companyAddressHTML = "";
    if (companyInfo) {
      const parts = [
        companyInfo.address,
        companyInfo.address1,
        companyInfo.address2,
        companyInfo.address3
      ].filter(Boolean);

      companyAddressHTML = parts.map(part => `<div class="subtitle" style="margin-bottom: 2px;">${part}</div>`).join('');

      // Add phone
      const phones = [
        companyInfo.phones,
        companyInfo.mobile
      ].filter(Boolean).join(', ');
      if (phones) {
        companyAddressHTML += `<div class="subtitle" style="margin-bottom: 2px;">Ph: ${phones}</div>`;
      }

      // Add GST/TIN
      if (companyInfo.tinno) {
        companyAddressHTML += `<div class="subtitle" style="margin-bottom: 2px;">GST/TIN: ${companyInfo.tinno}</div>`;
      }
    } else {
      companyAddressHTML = `<div class="subtitle">Order Receipt</div>`;
    }

    // Items rows
    const itemsRows = order.items.map(item => `
      <tr>
        <td style="text-align: left; padding: 5px; border-bottom: 1px solid #eee;">
          <div style="font-weight: bold;">${item.name}</div>
          <div style="font-size: 10px; color: #666;">${item.code || ''}</div>
        </td>
        <td style="text-align: center; padding: 5px; border-bottom: 1px solid #eee;">${item.hsn || item.text6 || '-'}</td>
        <td style="text-align: center; padding: 5px; border-bottom: 1px solid #eee;">${parseFloat(item.qty).toFixed(3)}</td>
        <td style="text-align: center; padding: 5px; border-bottom: 1px solid #eee;">${item.taxcode || item.gst || '-'}</td>
        <td style="text-align: right; padding: 5px; border-bottom: 1px solid #eee;">${item.price.toFixed(2)}</td>
        <td style="text-align: right; padding: 5px; border-bottom: 1px solid #eee;">${item.total.toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
            .header { text-align: center; margin-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 5px; color: #000; } /* Bold Black for Company Name */
            .subtitle { font-size: 14px; color: #555; margin-bottom: 5px; }
            
            .info-card { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e9ecef; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
            .label { font-weight: 600; color: #7f8c8d; }
            .value { font-weight: bold; color: #2c3e50; }

            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { text-align: left; padding: 8px 5px; background-color: #f8f9fa; color: #2c3e50; font-size: 12px; border-bottom: 2px solid #dde1e5; }
            td { font-size: 13px; }
            
            .totals { margin-top: 20px; border-top: 2px solid #2c3e50; padding-top: 10px; }
            .total-row { display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; color: #2c3e50; }
            
            .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #95a5a6; border-top: 1px solid #eee; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">${companyName}</div>
            ${companyAddressHTML}
            <div class="subtitle" style="margin-top: 10px; font-weight: bold;">Order Receipt</div>
            <div class="subtitle" style="margin-top: 5px;">Order ID: ${order.formattedOrderId || 'NA'}</div>
          </div>

          <div class="info-card">
            <div class="info-row">
              <span class="label">Date:</span>
              <span class="value">${date}</span>
            </div>
            <div class="info-row">
              <span class="label">Customer:</span>
              <span class="value">${order.customer}</span>
            </div>
            ${order.customerAddress ? `
            <div class="info-row">
              <span class="label">Address:</span>
              <span class="value">${order.customerAddress}</span>
            </div>` : ''}
            <div class="info-row">
              <span class="label">${order.customerPlace ? 'Place:' : 'Area:'}</span>
              <span class="value">${order.customerPlace || order.area}</span>
            </div>
            ${order.customerPhone ? `
            <div class="info-row">
              <span class="label">Phone:</span>
              <span class="value">${order.customerPhone}</span>
            </div>` : ''}
            ${order.orderCode ? `
            <div class="info-row">
              <span class="label">Order Code:</span>
              <span class="value">${order.orderCode}</span>
            </div>` : ''}
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 30%">Item</th>
                <th style="width: 10%; text-align: center;">HSN</th>
                <th style="width: 10%; text-align: center;">Qty</th>
                <th style="width: 10%; text-align: center;">GST</th>
                <th style="width: 20%; text-align: right;">Price</th>
                <th style="width: 20%; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="totals">
            <div class="total-row">
              <span>Total Amount</span>
              <span>${totalAmount}</span>
            </div>
          </div>

          <div class="footer">
            <p>Thank you for your business!</p>
            <p>Generated via TaskSAS App</p>
            <p style="font-weight: bold; margin-top: 5px;">Status: ${order.printStatus || 'F'}</p>
          </div>
        </body>
      </html>
    `;
  },



  isSharing: false,

  /**
   * Generates PDF and opens system share sheet
   * @param {Object} order 
   */
  shareOrderPDF: async (order) => {
    if (pdfService.isSharing) return;
    pdfService.isSharing = true;

    try {
      const companyInfo = await pdfService.fetchCompanyInfo();
      const html = pdfService.generateOrderHTML(order, companyInfo);

      // Attempt PDF generation with retry
      let uri = null;
      try {
        const { uri: pdfUri } = await Print.printToFileAsync({
          html: html,
          base64: false,
          margins: { top: 20, right: 20, bottom: 20, left: 20 }
        });
        uri = pdfUri;
      } catch (printError) {
        console.warn('First PDF generation attempt failed, retrying...', printError);
        // Retry once
        try {
          const { uri: pdfUriRetry } = await Print.printToFileAsync({
            html: html,
            base64: false,
            margins: { top: 20, right: 20, bottom: 20, left: 20 }
          });
          uri = pdfUriRetry;
        } catch (retryError) {
          console.error('PDF generation failed after retry:', retryError);
          throw retryError;
        }
      }

      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Share Order - ${order.customer}`
      });

      return true;
    } catch (error) {
      console.error('Error generating PDF:', error);

      // Fallback: Share HTML if PDF fails
      try {
        Alert.alert(
          "PDF Error",
          "Failed to generate PDF. Sharing as HTML instead.",
          [{ text: "OK" }]
        );

        const companyInfo = await pdfService.fetchCompanyInfo();
        const html = pdfService.generateOrderHTML(order, companyInfo);
        const htmlFileUri = FileSystem.documentDirectory + `order_${order.id || Date.now()}.html`;
        await FileSystem.writeAsStringAsync(htmlFileUri, html);

        await Sharing.shareAsync(htmlFileUri, {
          UTI: '.html',
          mimeType: 'text/html',
          dialogTitle: `Share Order (HTML) - ${order.customer}`
        });
        return true;
      } catch (fallbackError) {
        console.error('HTML Fallback also failed:', fallbackError);
        Alert.alert('Error', 'Failed to generate or share order receipt.');
        return false;
      }
    } finally {
      pdfService.isSharing = false;
    }
  },

  /**
   * Generates HTML for collection receipt voucher
   */
  generateCollectionHTML: (collection, companyInfo) => {
    const date = new Date(collection.date);
    const formattedDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

    const companyName = companyInfo?.firm_name || "Company Name";
    const voucherNo = collection.code || collection.local_id || collection.id || "N/A";
    const customerName = collection.customer_name || "Customer";
    const amount = parseFloat(collection.amount || 0).toFixed(2);
    const chequeRef = collection.cheque_number || collection.ref_no || formattedDate;
    const paymentType = collection.payment_type || "CASH";

    // Company Address
    let companyAddressHTML = "";
    if (companyInfo) {
      const parts = [
        companyInfo.address,
        companyInfo.address1,
        companyInfo.address2,
        companyInfo.address3
      ].filter(Boolean);
      companyAddressHTML = parts.map(part => `<div style="margin-bottom: 2px; font-size: 13px;">${part}</div>`).join('');
    }

    // Amount in words
    const numberToWords = (num) => {
      if (num === 0) return "ZERO RUPEES";

      const units = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"];
      const teens = ["TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
      const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

      const convert = (n) => {
        if (n < 10) return units[n];
        if (n < 20) return teens[n - 10];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + units[n % 10] : "");
        if (n < 1000) return units[Math.floor(n / 100)] + " HUNDRED" + (n % 100 ? " AND " + convert(n % 100) : "");
        if (n < 100000) return convert(Math.floor(n / 1000)) + " THOUSAND" + (n % 1000 ? " " + convert(n % 1000) : "");
        return convert(Math.floor(n / 100000)) + " LAKH" + (n % 100000 ? " " + convert(n % 100000) : "");
      };

      const intPart = Math.floor(num);
      return convert(intPart) + " RUPEES";
    };

    const amountInWords = numberToWords(parseFloat(collection.amount));

    return `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body { 
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
              padding: 30px; 
              color: #000;
              max-width: 800px;
              margin: 0 auto;
            }
            .header { 
              text-align: center; 
              margin-bottom: 25px;
              border-bottom: 2px solid #000;
              padding-bottom: 15px;
            }
            .company-name { 
              font-size: 26px; 
              font-weight: bold; 
              margin-bottom: 8px;
              text-transform: uppercase;
            }
            .voucher-title {
              font-size: 20px;
              font-weight: bold;
              margin-top: 15px;
              text-decoration: underline;
            }
            .voucher-info {
              display: flex;
              justify-content: space-between;
              margin: 20px 0;
              padding: 10px 0;
              border-bottom: 1px solid #000;
            }
            .voucher-info div {
              font-size: 14px;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 15px 0;
              border: 1px solid #000;
            }
            th, td { 
              padding: 10px; 
              text-align: left;
              border: 1px solid #000;
            }
            th { 
              background-color: #f5f5f5; 
              font-weight: bold;
              font-size: 13px;
            }
            td { 
              font-size: 13px;
            }
            .amount-col { text-align: right; }
            .total-row {
              font-weight: bold;
              background-color: #f9f9f9;
            }
            .amount-words {
              margin: 20px 0;
              padding: 10px;
              font-size: 13px;
            }
            .narration {
              margin: 20px 0;
              padding: 10px 0;
            }
            .narration-title {
              font-weight: bold;
              margin-bottom: 5px;
            }
            .footer {
              margin-top: 50px;
              display: flex;
              justify-content: space-between;
              padding-top: 20px;
              border-top: 1px solid #000;
            }
            .footer div {
              font-size: 13px;
            }
            .note {
              margin-top: 30px;
              font-size: 11px;
              font-style: italic;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">${companyName}</div>
            ${companyAddressHTML}
            <div class="voucher-title">Receipt Voucher</div>
          </div>

          <div class="voucher-info">
            <div><strong>V No:</strong> ${voucherNo}</div>
            <div><strong>Date:</strong> ${formattedDate}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 8%;">SI</th>
                <th style="width: 42%;">Particulars</th>
                <th style="width: 25%;">Amount</th>
                <th style="width: 25%;">Cheque No/DD</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>${customerName}</td>
                <td class="amount-col">${amount}</td>
                <td>${chequeRef}</td>
              </tr>
              <tr class="total-row">
                <td colspan="2" style="text-align: right; padding-right: 20px;">Total</td>
                <td class="amount-col"><strong>${amount}</strong></td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <div class="amount-words">
            <strong>Amount in words:</strong> ${amountInWords}
          </div>

          <div class="narration">
            <div class="narration-title">Narration</div>
            <div>(${paymentType}) ${collection.remarks || ''}</div>
          </div>

          <div class="note">
            * Cheques are subjected to realisation.
          </div>

          <div class="footer">
            <div>Prepared by.</div>
            <div>Accounted by.</div>
            <div><strong>For: ${companyName}</strong></div>
          </div>
        </body>
      </html>
    `;
  },

  /**
   * Generates PDF for collection receipt and opens share sheet
   */
  shareCollectionPDF: async (collection) => {
    if (pdfService.isSharing) return;
    pdfService.isSharing = true;

    try {
      const companyInfo = await pdfService.fetchCompanyInfo();
      const html = pdfService.generateCollectionHTML(collection, companyInfo);

      const { uri } = await Print.printToFileAsync({
        html: html,
        base64: false,
        margins: { top: 20, right: 20, bottom: 20, left: 20 }
      });

      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Share Receipt - ${collection.customer_name}`
      });

      return true;
    } catch (error) {
      console.error('Error generating collection PDF:', error);
      Alert.alert('Error', 'Failed to generate or share PDF');
      return false;
    } finally {
      pdfService.isSharing = false;
    }
  }
};

export default pdfService;
